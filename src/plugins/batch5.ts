// v0.5.7 plugins: Bookmarks, WhoReacted, VolumeBooster, SoundboardKeys, FolderTweaks
import { definePlugin, common, discord, storage, ui, h, watchElements, managedStyle, messageIdsFromElement, messageFromElement, onFlux, webpack } from "@api";

const nameOf = (u: any) => u?.globalName || u?.global_name || u?.username || "someone";
const hoveredMessage = () => [...document.querySelectorAll('[id^="chat-messages-"]:hover')].pop() as HTMLElement | undefined;

export interface Bookmark { channelId: string; messageId: string; author: string; content: string; where: string; at: number; files: number }

function where(channelId: string) {
    const ch = common.ChannelStore?.getChannel?.(channelId);
    const guild = ch?.guild_id ? common.GuildStore?.getGuild?.(ch.guild_id)?.name : null;
    return ch ? (guild ? `#${ch.name} · ${guild}` : ch.name || `DM with ${nameOf(common.UserStore?.getUser?.(ch.recipients?.[0]))}`) : "Unknown channel";
}

function bookmarkList(list: Bookmark[], onChange: () => void, onJump?: () => void) {
    if (!list.length) return ui.empty("No bookmarks yet. Hover a message and press Ctrl+B.", "info");
    return h("div", { style: { display: "grid", gap: "8px", maxHeight: "60vh", overflowY: "auto" } }, list.map(b => ui.card({ class: "vanta-pad" },
        h("div", { class: "vanta-item-top" },
            h("div", { class: "vanta-item-name" }, b.author, h("span", { class: "vanta-item-desc", style: { marginLeft: "8px", fontWeight: "400" } }, `${b.where} · ${new Date(b.at).toLocaleDateString()}`)),
            h("div", { style: { display: "flex", gap: "6px" } },
                ui.button("Jump", { small: true, variant: "primary", onClick: () => { discord.jumpTo(b.channelId, b.messageId); onJump?.(); } }),
                ui.button("", { small: true, variant: "ghost", icon: "trash", title: "Remove", onClick: () => { list.splice(list.indexOf(b), 1); storage.set("Bookmarks", list, 0); onChange(); } }))),
        h("div", { class: "vanta-item-desc", style: { whiteSpace: "pre-wrap", color: "var(--text-normal)" } }, b.content || (b.files ? `[${b.files} attachment${b.files > 1 ? "s" : ""}]` : "")))));
}

export default [
    definePlugin({
        name: "Bookmarks",
        description: "Save messages from anywhere. Hover a message and press Ctrl+B; Ctrl+Shift+B opens your bookmarks. They're in Vanta's Search too.",
        authors: ["Vanta"], category: "Utility", since: "0.5.7",
        needsWebpack: true,
        list: [] as Bookmark[],
        toggle(el: HTMLElement) {
            const ids = messageIdsFromElement(el);
            const m = messageFromElement(el);
            if (!ids) return;
            const i = this.list.findIndex(b => b.messageId === ids.messageId);
            if (i >= 0) { this.list.splice(i, 1); ui.toast("Bookmark removed."); }
            else {
                this.list.unshift({ ...ids, author: nameOf(m?.author), content: String(m?.content ?? "").slice(0, 500), where: where(ids.channelId), at: Date.now(), files: m?.attachments?.length ?? 0 });
                ui.toast("Bookmarked. Ctrl+Shift+B to see them all.", { type: "ok" });
            }
            storage.set("Bookmarks", this.list, 0);
            this.mark();
        },
        /** Puts a small marker on bookmarked messages that are on screen */
        mark() {
            const ids = new Set(this.list.map(b => b.messageId));
            for (const el of document.querySelectorAll<HTMLElement>('[id^="chat-messages-"]')) {
                const id = el.id.split("-").pop()!;
                el.classList.toggle("vanta-bookmarked", ids.has(id));
            }
        },
        open() {
            const box = h("div", {});
            let m: { close: () => void } | null = null;
            const draw = () => { box.replaceChildren(bookmarkList(this.list, () => { draw(); this.mark(); }, () => m?.close())); };
            draw();
            m = ui.modal({ title: `Bookmarks (${this.list.length})`, body: box, buttons: [{ text: "Close", variant: "ghost" }] });
        },
        async start() {
            this.list = (await storage.get<Bookmark[]>("Bookmarks")) ?? [];
            this.style = managedStyle("vanta-bookmarks");
            this.style.set(`.vanta-bookmarked { box-shadow: inset 2px 0 0 var(--vanta-accent, #a98bff); }`);
            this.onKey = (e: KeyboardEvent) => {
                if (!(e.ctrlKey || e.metaKey) || e.altKey || e.code !== "KeyB") return;
                if (e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); return this.open(); }
                const el = hoveredMessage();
                if (!el) return;
                e.preventDefault(); e.stopImmediatePropagation();
                this.toggle(el);
            };
            document.addEventListener("keydown", this.onKey, true);
            this.unwatch = watchElements('[id^="chat-messages-"]', el => {
                if (this.list.some(b => el.id.endsWith("-" + b.messageId))) el.classList.add("vanta-bookmarked");
            });
        },
        stop() {
            document.removeEventListener("keydown", this.onKey, true);
            this.unwatch?.(); this.style?.remove();
            document.querySelectorAll(".vanta-bookmarked").forEach(e => e.classList.remove("vanta-bookmarked"));
        },
        settingsPanel() { const box = h("div", {}); const draw = () => box.replaceChildren(bookmarkList(this.list, draw)); draw(); return box; },
    }),

    definePlugin({
        name: "WhoReacted",
        description: "Shows the avatars of people who reacted, right on each reaction. Loaded only for reactions on screen, a few at a time.",
        authors: ["Vanta"], category: "Chat", since: "0.5.7",
        needsWebpack: true,
        options: { max: { type: "number", default: 4, label: "Avatars per reaction", description: "1 to 8" } },
        cache: new Map<string, any[]>(),
        queue: [] as (() => Promise<void>)[],
        pump() {
            if (this.busy || !this.queue.length) return;
            this.busy = true;
            const job = this.queue.shift()!;
            // One request at a time, spaced out, so Discord never rate-limits you
            job().catch(() => { }).finally(() => setTimeout(() => { this.busy = false; this.pump(); }, 700));
        },
        render(el: HTMLElement, users: any[]) {
            el.querySelector(".vanta-reactors")?.remove();
            if (!users.length) return;
            const box = h("span", { class: "vanta-reactors", title: users.map(nameOf).join(", ") });
            for (const u of users) {
                const src = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=32` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
                box.append(h("img", { src, alt: "", loading: "lazy" }));
            }
            (el.querySelector('[class*="reactionInner_"]') ?? el).append(box);
        },
        load(el: HTMLElement) {
            const msgEl = el.closest('[id^="chat-messages-"]');
            const ids = messageIdsFromElement(msgEl);
            const m = msgEl && messageFromElement(msgEl);
            if (!ids || !m?.reactions?.length) return;
            const reactions = [...el.parentElement!.querySelectorAll<HTMLElement>('[class*="reaction_"]')];
            const r = m.reactions[reactions.indexOf(el)];
            if (!r?.emoji) return;
            const emoji = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
            const max = Math.max(1, Math.min(8, Number(this.settings.max) || 4));
            const key = `${ids.messageId}:${emoji}:${r.count}`;
            const hit = this.cache.get(key);
            if (hit) return this.render(el, hit.slice(0, max));
            this.queue.push(async () => {
                if (!el.isConnected) return;
                const res = await discord.api().get({ url: `/channels/${ids.channelId}/messages/${ids.messageId}/reactions/${encodeURIComponent(emoji)}`, query: { limit: max, type: 0 } });
                const users = Array.isArray(res?.body) ? res.body : [];
                this.cache.set(key, users);
                if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
                if (el.isConnected) this.render(el, users.slice(0, max));
            });
            this.pump();
        },
        start() {
            if (!discord.api()) throw new Error("Discord's API module wasn't found");
            this.style = managedStyle("vanta-who-reacted");
            this.style.set(`.vanta-reactors { display: inline-flex; margin-left: 4px; vertical-align: middle; }
.vanta-reactors img { width: 16px; height: 16px; border-radius: 50%; margin-left: -4px; box-shadow: 0 0 0 2px var(--background-secondary, #2b2d31); }
.vanta-reactors img:first-child { margin-left: 0; }`);
            // Only reactions you can actually see get loaded
            this.io = new IntersectionObserver(entries => {
                for (const e of entries) if (e.isIntersecting) { this.io.unobserve(e.target); this.load(e.target as HTMLElement); }
            }, { rootMargin: "200px 0px" });
            this.unwatch = watchElements('[id^="chat-messages-"] [class*="reaction_"]', el => this.io.observe(el));
            // A new reaction: refresh that message's avatars
            const refresh = ({ messageId }: any) => setTimeout(() => {
                for (const el of document.querySelectorAll<HTMLElement>(`[id$="-${messageId}"] [class*="reaction_"]`)) this.load(el);
            }, 300);
            this.offs = [onFlux("MESSAGE_REACTION_ADD", refresh), onFlux("MESSAGE_REACTION_REMOVE", refresh)];
        },
        stop() {
            this.unwatch?.(); this.io?.disconnect(); this.offs?.forEach((f: () => void) => f());
            this.queue.length = 0; this.style?.remove();
            document.querySelectorAll(".vanta-reactors").forEach(e => e.remove());
        },
    }),

    definePlugin({
        name: "VolumeBooster",
        description: "Turn people up past Discord's 200% limit (up to 500%). Use the sliders in this plugin's settings while you're in a call.",
        authors: ["Vanta"], category: "Utility", since: "0.5.7",
        needsWebpack: true,
        start() {
            this.Media = webpack.findStore("MediaEngineStore");
            this.Voice = webpack.findStore("VoiceStateStore");
            if (!this.Media || !common.FluxDispatcher) throw new Error("Discord's voice stores weren't found");
        },
        settingsPanel() {
            const ch = common.SelectedChannelStore?.getVoiceChannelId?.();
            const me = common.UserStore?.getCurrentUser?.()?.id;
            if (!this.started) return ui.empty("Turn the plugin on first.", "info");
            if (!ch) return ui.empty("Join a voice channel, then open this again to set volumes.", "info");
            const ids = Object.keys(this.Voice?.getVoiceStatesForChannel?.(ch) ?? {}).filter(id => id !== me);
            if (!ids.length) return ui.empty("Nobody else is in your call.", "info");
            return h("div", { style: { display: "grid", gap: "10px" } }, ids.map(id => {
                const now = Math.round(this.Media.getLocalVolume?.(id) ?? 100);
                const label = h("span", { style: { width: "48px", textAlign: "right" } }, `${now}%`);
                const slider = h("input", { type: "range", min: 0, max: 500, step: 5, value: now, style: { flex: "1" }, "aria-label": `Volume for ${nameOf(common.UserStore?.getUser?.(id))}` }) as HTMLInputElement;
                slider.addEventListener("input", () => {
                    label.textContent = slider.value + "%";
                    common.FluxDispatcher.dispatch({ type: "AUDIO_SET_LOCAL_VOLUME", context: "default", userId: id, volume: Number(slider.value) });
                });
                return h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
                    h("span", { style: { width: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, nameOf(common.UserStore?.getUser?.(id))), slider, label);
            }));
        },
    }),

    definePlugin({
        name: "SoundboardKeys",
        description: "Alt+1 to Alt+9 play your first nine soundboard favourites in the voice channel you're in.",
        authors: ["Vanta"], category: "Utility", since: "0.5.7",
        needsWebpack: true,
        start() {
            this.Sounds = webpack.findStore("SoundboardStore");
            if (!this.Sounds) throw new Error("Discord's soundboard wasn't found");
            this.onKey = async (e: KeyboardEvent) => {
                if (!e.altKey || e.ctrlKey || e.shiftKey || !/^Digit[1-9]$/.test(e.code)) return;
                const channelId = common.SelectedChannelStore?.getVoiceChannelId?.();
                if (!channelId) return;
                const favs: string[] = [...(this.Sounds.getFavorites?.() ?? [])];
                const soundId = favs[Number(e.code.slice(5)) - 1];
                if (!soundId) return ui.toast("No soundboard favourite in that slot.");
                e.preventDefault(); e.stopImmediatePropagation();
                const sound = this.Sounds.getSoundById?.(soundId);
                const guildId = sound?.guildId && sound.guildId !== "0" ? sound.guildId : undefined;
                try {
                    await discord.api().post({ url: `/channels/${channelId}/send-soundboard-sound`, body: { sound_id: soundId, ...(guildId ? { source_guild_id: guildId } : {}) } });
                } catch (err: any) { ui.toast("Couldn't play it: " + (err?.body?.message ?? err?.message ?? err), { type: "danger" }); }
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),

    definePlugin({
        name: "FolderTweaks",
        description: "Server folders that close themselves when you leave them, and folder colours that fill the whole folder.",
        authors: ["Vanta"], category: "Appearance", since: "0.5.7",
        needsWebpack: true,
        options: {
            autoClose: { type: "boolean", default: true, label: "Close folders you're not in" },
            tint: { type: "boolean", default: true, label: "Tint open folders with their colour" },
        },
        start() {
            this.Folders = webpack.findStore("SortedGuildStore");
            this.Expanded = webpack.findStore("ExpandedGuildFolderStore");
            this.style = managedStyle("vanta-folder-tweaks");
            this.apply();
            this.off = onFlux("CHANNEL_SELECT", ({ guildId }: any) => {
                if (!this.settings.autoClose || !this.Expanded || !this.Folders) return;
                const folders: any[] = this.Folders.getGuildFolders?.() ?? [];
                for (const f of folders) {
                    if (!f.folderId || !this.Expanded.isFolderExpanded?.(f.folderId)) continue;
                    if (guildId && f.guildIds?.includes(guildId)) continue; // the folder you're in stays open
                    common.FluxDispatcher.dispatch({ type: "TOGGLE_GUILD_FOLDER_EXPAND", folderId: f.folderId });
                }
            });
        },
        apply() {
            this.style.set(this.settings.tint ? `[class*="folder_"][class*="expanded_"], [class*="expandedFolderBackground_"] { background: color-mix(in srgb, currentColor 18%, transparent) !important; }` : "");
        },
        onSettingChange() { if (this.started) this.apply(); },
        stop() { this.off?.(); this.style?.remove(); },
    }),
];
