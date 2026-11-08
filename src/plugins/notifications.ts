// Notification-related plugins built on Discord's own stores and events.
import { definePlugin, every, common, webpack, onFlux, net, ui, h, managedStyle } from "@api";

const desktopNotify = (title: string, body: string) => {
    try { if ("Notification" in window) new Notification(title, { body, silent: false }); } catch { }
};
const userName = (u: any) => u?.globalName || u?.global_name || u?.username || "Someone";

export default [
    definePlugin({
        name: "ReadAllNotifications",
        description: "Adds a \"Read all\" button above your server list that clears every unread server at once.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        options: { dms: { type: "boolean", default: false, label: "Also mark DMs as read" } },

        stores() {
            return {
                ReadState: common.ReadStateStore,
                GuildChannels: common.GuildChannelStore,
            };
        },
        /** Marks every unread channel as read. Returns how many channels were cleared. */
        readAll() {
            const { ReadState, GuildChannels } = this.stores();
            const { GuildStore, ChannelStore, FluxDispatcher } = common;
            if (!ReadState || !GuildChannels || !GuildStore || !FluxDispatcher) throw new Error("Discord's read-state modules weren't found");
            const channels: { channelId: string; messageId: string; readStateType: number }[] = [];
            const push = (id: string) => {
                if (ReadState.hasUnread(id)) channels.push({ channelId: id, messageId: ReadState.lastMessageId(id), readStateType: 0 });
            };
            for (const guildId of Object.keys(GuildStore.getGuilds())) {
                const c = GuildChannels.getChannels(guildId) || {};
                for (const { channel } of [...(c.SELECTABLE || []), ...(c.VOCAL || [])]) if (channel?.id) push(channel.id);
            }
            if (this.settings.dms) for (const ch of Object.values<any>(ChannelStore?.getMutablePrivateChannels?.() || {})) push(ch.id);
            if (channels.length) FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
            return channels.length;
        },
        insert() {
            if (this.btn?.isConnected) return;
            const sep = document.querySelector('nav[aria-label="Servers sidebar"] [class*="guildSeparator_"]');
            const item = sep?.closest('[class*="listItem_"]') ?? sep;
            if (!item?.parentElement) return;
            this.btn ??= h("button", {
                class: "vanta-readall", type: "button", title: "Mark all servers as read",
                onclick: () => {
                    try {
                        const n = this.readAll();
                        ui.toast(n ? `Marked ${n} channel${n === 1 ? "" : "s"} as read` : "Nothing unread", { type: n ? "ok" : "" });
                    } catch (e: any) { ui.toast(e.message, { type: "danger" }); }
                },
            }, "Read all");
            item.parentElement.insertBefore(this.btn, item);
        },
        start() {
            this.style = managedStyle("vanta-readall");
            this.style.set(`.vanta-readall { all: unset; box-sizing: border-box; display: block; width: 48px; margin: 4px auto 6px; padding: 4px 0; text-align: center;
  cursor: pointer; border-radius: 8px; font: 700 10px var(--font-primary, sans-serif); letter-spacing: .02em; color: var(--text-muted);
  background: var(--background-surface-high, rgba(150,150,160,.12)); transition: color .12s, background .12s; }
.vanta-readall:hover { color: var(--text-default); background: var(--background-mod-normal, rgba(150,150,160,.2)); }
.vanta-readall:focus-visible { outline: 2px solid #8b5cf6; }`);
            this.insert();
            // The server list re-renders sometimes; put the button back if it goes away.
            this.timer = every(() => this.insert(), 2000);
        },
        stop() { clearInterval(this.timer); this.btn?.remove(); this.btn = null; this.style?.remove(); },
    }),

    definePlugin({
        name: "RelationshipNotifier",
        description: "Tells you when someone unfriends you, cancels a friend request, or removes you from a server or group chat.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        options: {
            friends: { type: "boolean", default: true, label: "Friend removed" },
            requests: { type: "boolean", default: true, label: "Friend request cancelled" },
            servers: { type: "boolean", default: true, label: "Removed from a server" },
            groups: { type: "boolean", default: true, label: "Removed from a group chat" },
            desktop: { type: "boolean", default: true, label: "Also show a Windows notification" },
        },
        start() {
            const selfRemoved = new Set<string>();
            const guildNames = new Map<string, string>();
            const groupNames = new Map<string, string>();
            const remember = () => {
                for (const g of Object.values<any>(common.GuildStore?.getGuilds?.() || {})) guildNames.set(g.id, g.name);
                for (const c of Object.values<any>(common.ChannelStore?.getMutablePrivateChannels?.() || {}))
                    if (c.type === 3) groupNames.set(c.id, c.name || c.rawRecipients?.map((r: any) => r.username).join(", ") || "a group");
            };
            remember();
            const say = (text: string) => {
                ui.toast(text, { ms: 8000 });
                if (this.settings.desktop) desktopNotify("Vanta", text);
            };
            // Things *you* do also produce these events; note them so we don't notify about your own actions.
            this.offNet = net.block(({ method, url }) => {
                if (method !== "DELETE") return false;
                const m = url.match(/\/users\/@me\/relationships\/(\d+)$|\/users\/@me\/guilds\/(\d+)$|\/channels\/(\d+)(?:\/recipients\/\d+)?$/);
                if (m) selfRemoved.add(m[1] || m[2] || m[3]);
                return false;
            });
            this.offs = [
                onFlux("RELATIONSHIP_REMOVE", ({ relationship }) => {
                    const id = relationship?.id;
                    if (!id || selfRemoved.delete(id)) return;
                    const u = common.UserStore?.getUser?.(id) ?? relationship.user;
                    if (relationship.type === 1 && this.settings.friends) say(`${userName(u)} removed you as a friend`);
                    if (relationship.type === 3 && this.settings.requests) say(`${userName(u)} cancelled their friend request`);
                }),
                onFlux("GUILD_DELETE", ({ guild }) => {
                    if (!guild?.id || guild.unavailable || selfRemoved.delete(guild.id)) return;
                    if (this.settings.servers) say(`You were removed from ${guildNames.get(guild.id) ?? "a server"}`);
                }),
                onFlux("CHANNEL_DELETE", ({ channel }) => {
                    if (channel?.type !== 3 || selfRemoved.delete(channel.id)) return;
                    if (this.settings.groups) say(`You were removed from the group ${groupNames.get(channel.id) ?? channel.name ?? ""}`.trim());
                }),
                onFlux("GUILD_CREATE", remember),
                onFlux("CHANNEL_CREATE", remember),
            ];
        },
        stop() { this.offNet?.(); this.offs?.forEach((f: () => void) => f()); },
    }),

    definePlugin({
        name: "VoiceChannelAlerts",
        description: "Tells you when people join or leave the voice channel you're in, and can say it out loud.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        options: {
            speak: { type: "boolean", default: false, label: "Say it out loud", description: "Uses your computer's text-to-speech voice." },
            toast: { type: "boolean", default: true, label: "Show a notification" },
        },
        start() {
            const where = new Map<string, string | null>();
            this.off = onFlux("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                const mine = common.SelectedChannelStore?.getVoiceChannelId?.();
                const me = common.UserStore?.getCurrentUser?.()?.id;
                for (const vs of voiceStates || []) {
                    const prev = where.get(vs.userId) ?? null;
                    where.set(vs.userId, vs.channelId ?? null);
                    if (!mine || vs.userId === me || prev === vs.channelId) continue;
                    const name = userName(common.UserStore?.getUser?.(vs.userId));
                    const text = vs.channelId === mine ? `${name} joined` : prev === mine ? `${name} left` : null;
                    if (!text) continue;
                    if (this.settings.toast) ui.toast(text, { ms: 3000 });
                    if (this.settings.speak && "speechSynthesis" in window) {
                        const u = new SpeechSynthesisUtterance(text);
                        u.volume = 0.8;
                        speechSynthesis.speak(u);
                    }
                }
            });
        },
        stop() { this.off?.(); },
    }),

    definePlugin({
        name: "MuteNewServers",
        description: "When you join a server, it's muted with @everyone and role pings suppressed, so new servers don't flood you.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        start() {
            // Discord's authenticated HTTP helper: { get, post, put, patch, del }
            const RestAPI = webpack.findByProps("get", "post", "put", "patch", "del");
            if (!RestAPI) throw new Error("Discord's API module wasn't found");
            const joined = new Set<string>();
            // Only servers you join from now on (GUILD_CREATE also fires for existing servers on reconnect).
            this.offNet = net.block(({ method, url }) => {
                if (method === "POST" && /\/invites\/[\w-]+$/.test(url)) this.expectJoin = Date.now();
                return false;
            });
            this.off = onFlux("GUILD_CREATE", ({ guild }) => {
                if (!guild?.id || joined.has(guild.id)) return;
                const joinedAt = Date.parse(guild.joined_at ?? guild.joinedAt ?? "");
                const fresh = (joinedAt && Date.now() - joinedAt < 60_000) || (this.expectJoin && Date.now() - this.expectJoin < 60_000);
                if (!fresh) return;
                joined.add(guild.id);
                RestAPI.patch({
                    url: `/users/@me/guilds/${guild.id}/settings`,
                    body: { muted: true, suppress_everyone: true, suppress_roles: true, message_notifications: 1 },
                }).then(() => ui.toast(`Muted ${guild.name ?? "the new server"}`), (e: any) => this.logger.error("Couldn't mute new server", e));
            });
        },
        stop() { this.off?.(); this.offNet?.(); },
    }),
];
