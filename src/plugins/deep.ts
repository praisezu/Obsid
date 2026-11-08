// Plugins that read Discord's stores more deeply.
import { definePlugin, every, common, webpack, patcher, onFlux, watchElements, managedStyle, messageFromElement, storage, ui, h } from "@api";

const VIEW_CHANNEL = 1n << 10n;
const userName = (u: any) => u?.globalName || u?.global_name || u?.username || "Unknown";

/* ---------------------------------------------------------- platform icons */
const PLATFORM_ICONS: Record<string, string> = {
    desktop: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6v2h3v2H7v-2h3v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h16V6H4Z",
    mobile: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v14h8V4H8Zm3 15h2v1h-2v-1Z",
    web: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15 15 0 0 0-1.4-5.7A8 8 0 0 1 18.9 11ZM12 4c.9 1.2 1.7 3.7 1.9 7h-3.8c.2-3.3 1-5.8 1.9-7ZM9.5 5.3A15 15 0 0 0 8.1 11h-3a8 8 0 0 1 4.4-5.7ZM5.1 13h3a15 15 0 0 0 1.4 5.7A8 8 0 0 1 5.1 13ZM12 20c-.9-1.2-1.7-3.7-1.9-7h3.8c-.2 3.3-1 5.8-1.9 7Zm2.5-1.3a15 15 0 0 0 1.4-5.7h3a8 8 0 0 1-4.4 5.7Z",
};
const STATUS_COLOR: Record<string, string> = {
    online: "var(--status-positive, #3ba55c)", idle: "var(--status-warning, #f0b232)", dnd: "var(--status-danger, #e5484d)",
};

export default [
    definePlugin({
        name: "PlatformIndicators",
        description: "Shows whether people are on desktop, phone or web, next to their names in chat, the member list and DMs.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        options: {
            chat: { type: "boolean", default: true, label: "In chat (message headers)" },
            members: { type: "boolean", default: true, label: "In the member list" },
            dms: { type: "boolean", default: true, label: "In the DM list" },
        },
        clientStatus(userId: string): Record<string, string> {
            const P = common.PresenceStore;
            return P?.getState?.()?.clientStatuses?.[userId] ?? P?.getClientStatus?.(userId) ?? {};
        },
        render(host: HTMLElement, userId: string) {
            let box = host.querySelector<HTMLElement>(":scope > .vanta-platforms");
            const st = this.clientStatus(userId);
            const entries = Object.entries(st).filter(([k, v]) => PLATFORM_ICONS[k] && v && v !== "offline");
            if (!entries.length) { box?.remove(); return; }
            if (!box) { box = document.createElement("span"); box.className = "vanta-platforms"; host.append(box); }
            box.dataset.userId = userId;
            box.replaceChildren(...entries.map(([platform, status]) => {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
                const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute("d", PLATFORM_ICONS[platform]); p.setAttribute("fill", STATUS_COLOR[status] ?? "currentColor"); p.setAttribute("fill-rule", "evenodd");
                svg.append(p);
                const s = document.createElement("span");
                s.title = `${platform[0].toUpperCase() + platform.slice(1)}: ${status === "dnd" ? "Do Not Disturb" : status}`;
                s.append(svg);
                return s;
            }));
        },
        start() {
            this.style = managedStyle("vanta-platforms");
            this.style.set(`.vanta-platforms { display:inline-flex; gap:2px; margin-left:6px; vertical-align:middle; align-items:center; }
.vanta-platforms span { display:inline-flex; }`);
            const unwatch: (() => void)[] = [];
            if (this.settings.chat) unwatch.push(watchElements('[id^="message-username-"]', el => {
                const id = messageFromElement(el)?.author?.id;
                if (id) this.render(el, id);
            }));
            const avatarId = (el: Element) => el.querySelector<HTMLImageElement>('img[src*="/avatars/"]')?.src.match(/\/avatars\/(\d+)\//)?.[1];
            if (this.settings.members) unwatch.push(watchElements('[class*="membersWrap_"] [class*="member_"]', el => {
                const id = avatarId(el);
                const name = el.querySelector<HTMLElement>('[class*="name_"]') ?? el;
                if (id) this.render(name, id);
            }));
            if (this.settings.dms) unwatch.push(watchElements('[class*="privateChannels_"] a[href^="/channels/@me/"]', el => {
                const ch = common.ChannelStore?.getChannel?.(el.getAttribute("href")!.split("/").pop());
                const id = ch?.recipients?.length === 1 ? ch.recipients[0] : null;
                const name = el.querySelector<HTMLElement>('[class*="name_"]') ?? el;
                if (id) this.render(name, id);
            }));
            this.unwatch = unwatch;
            let t: any;
            this.off = onFlux("PRESENCE_UPDATES", () => {
                clearTimeout(t);
                t = setTimeout(() => document.querySelectorAll<HTMLElement>(".vanta-platforms").forEach(b => this.render(b.parentElement!, b.dataset.userId!)), 1000);
            });
        },
        stop() { this.unwatch?.forEach((u: () => void) => u()); this.off?.(); this.style?.remove(); document.querySelectorAll(".vanta-platforms").forEach(e => e.remove()); },
    }),

    definePlugin({
        name: "HiddenChannels",
        description: "Shows which channels in a server you can't see (names, categories and topics), in a read-only list.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        hidden(guildId: string) {
            const all = common.ChannelStore?.getMutableGuildChannelsForGuild?.(guildId) ?? {};
            return Object.values<any>(all)
                .filter(c => [0, 2, 5, 13, 15, 16].includes(c.type) && !this.Perms.can(VIEW_CHANNEL, c))
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        },
        open(guildId: string) {
            const list = this.hidden(guildId);
            const all = common.ChannelStore?.getMutableGuildChannelsForGuild?.(guildId) ?? {};
            const typeName: Record<number, string> = { 0: "#", 2: "🔊", 5: "📢", 13: "🎙", 15: "💬", 16: "🖼" };
            ui.modal({
                title: `Hidden channels (${list.length})`,
                body: [
                    h("div", { class: "vanta-row-desc" }, "Channels in this server that your roles can't see. You can read their names and topics, not their messages."),
                    ui.card({ class: "vanta-rows", style: { maxHeight: "420px", overflow: "auto" } }, list.map(c => ui.row({
                        title: `${typeName[c.type] ?? "#"} ${c.name}`,
                        description: [c.parent_id && all[c.parent_id]?.name ? `in ${all[c.parent_id].name}` : null, c.topic].filter(Boolean).join(" · ") || null,
                    }))),
                ],
                buttons: [{ text: "Close", variant: "primary" }],
            });
        },
        start() {
            this.Perms = webpack.findStore("PermissionStore");
            if (!this.Perms?.can) throw new Error("Discord's permission store wasn't found");
            this.style = managedStyle("vanta-hidden-channels");
            this.style.set(`.vanta-hidden-pill { all:unset; cursor:pointer; display:block; margin:8px 8px 12px; padding:6px 10px; border-radius:6px; font:600 12px var(--font-primary, sans-serif);
  color:var(--text-muted); background:var(--background-mod-subtle, rgba(150,150,160,.1)); text-align:center; }
.vanta-hidden-pill:hover { color:var(--text-default); background:var(--background-mod-normal, rgba(150,150,160,.16)); }`);
            this.timer = every(() => {
                const gid = common.SelectedGuildStore?.getGuildId?.();
                const nav = document.querySelector<HTMLElement>('nav[aria-label$="(server)"]');
                if (!gid || !nav) { this.pill?.remove(); return; }
                const n = this.hidden(gid).length;
                if (!n) { this.pill?.remove(); return; }
                this.pill ??= h("button", { class: "vanta-hidden-pill", type: "button", onclick: () => this.open(common.SelectedGuildStore.getGuildId()) });
                this.pill.textContent = `🔒 ${n} hidden channel${n === 1 ? "" : "s"}`;
                const scroller = nav.querySelector('[class*="scroller_"]') ?? nav;
                if (this.pill.parentElement !== scroller) scroller.append(this.pill);
            }, 1500);
        },
        stop() { clearInterval(this.timer); this.pill?.remove(); this.pill = null; this.style?.remove(); },
    }),

    definePlugin({
        name: "NoBlockedMessages",
        description: "Messages from people you've blocked disappear completely, instead of showing as \"blocked message\".",
        authors: ["Vanta"], category: "Chat",
        needsWebpack: true,
        options: { ignored: { type: "boolean", default: true, label: "Also hide people you've ignored" } },
        hide(authorId?: string) {
            const R = common.RelationshipStore;
            if (!authorId || !R) return false;
            return !!R.isBlocked?.(authorId) || (this.settings.ignored && !!R.isIgnored?.(authorId));
        },
        start() {
            const D = common.FluxDispatcher;
            this.unpatch = patcher.instead(D, "dispatch", (args: any[], original: (...a: any[]) => any) => {
                const a = args[0];
                try {
                    if (a?.type === "MESSAGE_CREATE" && this.hide(a.message?.author?.id)) return Promise.resolve();
                    if ((a?.type === "LOAD_MESSAGES_SUCCESS" || a?.type === "LOAD_MESSAGES_AROUND_SUCCESS") && Array.isArray(a.messages)) {
                        const kept = a.messages.filter((m: any) => !this.hide(m?.author?.id));
                        if (kept.length !== a.messages.length) return original({ ...a, messages: kept });
                    }
                } catch (e) { this.logger.error(e); }
                return original(...args);
            });
        },
        stop() { this.unpatch?.(); },
    }),

    definePlugin({
        name: "FriendsSince",
        description: "Shows when you became friends with someone on their profile.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        start() {
            this.style = managedStyle("vanta-friends-since");
            this.style.set(`.vanta-friends-since { margin:8px 0 0; font:500 12px var(--font-primary, sans-serif); color:var(--text-muted); }
.vanta-friends-since b { color:var(--text-default); font-weight:600; }`);
            this.unwatch = watchElements('[role="dialog"]', dialog => {
                // Profile popouts/modals show the user's avatar; find the user id from it
                setTimeout(() => {
                    if (dialog.querySelector(".vanta-friends-since")) return;
                    const id = dialog.querySelector<HTMLImageElement>('img[src*="/avatars/"]')?.src.match(/\/avatars\/(\d+)\//)?.[1];
                    const since = id && common.RelationshipStore?.getSince?.(id);
                    if (!since || common.RelationshipStore?.getRelationshipType?.(id) !== 1) return;
                    const date = new Date(since);
                    if (isNaN(+date)) return;
                    const line = h("div", { class: "vanta-friends-since" }, "Friends since ", h("b", {}, date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })));
                    const anchor = dialog.querySelector('[class*="memberSince"], [class*="userProfileInner"] section, [class*="body_"], [class*="scroller_"]') ?? dialog;
                    anchor.append(line);
                }, 150);
            });
        },
        stop() { this.unwatch?.(); this.style?.remove(); document.querySelectorAll(".vanta-friends-since").forEach(e => e.remove()); },
    }),

    definePlugin({
        name: "PinDMs",
        description: "Pin your favourite DMs: hover a DM and click the pin, and it stays in a row at the top of your DM list.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        pinned: [] as string[],
        save() { storage.set("PinDMs", this.pinned); this.renderRow(); this.syncButtons(); },
        toggle(id: string) {
            this.pinned = this.pinned.includes(id) ? this.pinned.filter((x: string) => x !== id) : [...this.pinned, id];
            this.save();
        },
        go(id: string) {
            const link = document.querySelector<HTMLElement>(`[class*="privateChannels_"] a[href="/channels/@me/${id}"]`);
            if (link) return link.click();
            this.transitionTo?.(`/channels/@me/${id}`);
        },
        renderRow() {
            const list = document.querySelector('[class*="privateChannels_"]');
            const header = list?.querySelector('[class*="privateChannelsHeaderContainer_"]');
            if (!list || !header || !this.pinned.length) { this.row?.remove(); return; }
            this.row ??= h("div", { class: "vanta-pins" });
            this.row.replaceChildren(...this.pinned.map((id: string) => {
                const ch = common.ChannelStore?.getChannel?.(id);
                if (!ch) return null;
                const user = ch.recipients?.length === 1 ? common.UserStore?.getUser?.(ch.recipients[0]) : null;
                const name = ch.name || (user ? userName(user) : "DM");
                const avatar = user?.getAvatarURL?.(undefined, 64) ?? (ch.icon ? `https://cdn.discordapp.com/channel-icons/${id}/${ch.icon}.png?size=64` : null);
                return h("button", { class: "vanta-pin", type: "button", title: name, onclick: () => this.go(id) },
                    avatar ? h("img", { src: avatar, alt: "" }) : h("span", {}, name.slice(0, 1).toUpperCase()));
            }).filter(Boolean) as Node[]);
            if (this.row.nextElementSibling !== header) header.before(this.row);
        },
        syncButtons() {
            document.querySelectorAll<HTMLElement>(".vanta-pin-toggle").forEach(b => {
                const on = this.pinned.includes(b.dataset.id!);
                b.textContent = "📌";
                b.classList.toggle("on", on);
                b.title = on ? "Unpin" : "Pin to top";
            });
        },
        async start() {
            this.pinned = (await storage.get<string[]>("PinDMs")) ?? [];
            // Discord's navigation function (found by the log message it prints)
            this.transitionTo = webpack.findByCode("transitionTo -");
            this.style = managedStyle("vanta-pindms");
            this.style.set(`.vanta-pins { display:flex; flex-wrap:wrap; gap:6px; padding:8px 10px 4px; }
.vanta-pin { all:unset; cursor:pointer; width:36px; height:36px; border-radius:50%; overflow:hidden; display:grid; place-items:center;
  background:var(--background-surface-high, #2b2d31); color:var(--text-default); font:700 14px var(--font-primary, sans-serif); box-shadow:0 0 0 2px transparent; transition:box-shadow .12s; }
.vanta-pin:hover, .vanta-pin:focus-visible { box-shadow:0 0 0 2px #8b5cf6; }
.vanta-pin img { width:100%; height:100%; object-fit:cover; }
.vanta-pin-wrap { position:relative; }
.vanta-pin-toggle { all:unset; cursor:pointer; position:absolute; right:30px; top:50%; transform:translateY(-50%); font-size:12px; opacity:0; filter:grayscale(1); z-index:2; }
.vanta-pin-wrap:hover .vanta-pin-toggle, .vanta-pin-toggle.on { opacity:.9; }
.vanta-pin-toggle.on { filter:none; }`);
            this.unwatch = watchElements('[class*="privateChannels_"] a[href^="/channels/@me/"]', a => {
                const id = a.getAttribute("href")!.split("/").pop()!;
                const wrap = a.parentElement;
                if (!wrap || wrap.querySelector(".vanta-pin-toggle")) return;
                wrap.classList.add("vanta-pin-wrap");
                const btn = h("button", { class: "vanta-pin-toggle", type: "button", "data-id": id, "aria-label": "Pin DM" });
                btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this.toggle(id); });
                wrap.append(btn);
                this.syncButtons();
                this.renderRow();
            });
            this.timer = every(() => this.renderRow(), 3000); // the DM list re-renders when you navigate
            this.renderRow();
        },
        stop() {
            this.unwatch?.(); clearInterval(this.timer); this.style?.remove(); this.row?.remove(); this.row = null;
            document.querySelectorAll(".vanta-pin-toggle").forEach(e => e.remove());
            document.querySelectorAll(".vanta-pin-wrap").forEach(e => e.classList.remove("vanta-pin-wrap"));
        },
    }),
];
