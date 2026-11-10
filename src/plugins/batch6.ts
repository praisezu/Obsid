// v0.6.0 plugins: ChannelTabs, VantaSwitcher, MediaViewer, ImageGallery, VideoDownloader, MuteOverlay, StreamPrivacy
import { definePlugin, common, discord, storage, ui, h, watchElements, managedStyle, onFlux, webpack, native, plugins, isPluginEnabled, setPluginEnabled } from "@api";

const nameOf = (u: any) => u?.globalName || u?.global_name || u?.username || "someone";
function channelLabel(id: string) {
    const ch = common.ChannelStore?.getChannel?.(id);
    if (!ch) return { name: "Unknown", icon: null as string | null, guildId: null as string | null };
    if (ch.type === 1) {
        const u = common.UserStore?.getUser?.(ch.recipients?.[0]);
        return { name: nameOf(u), icon: u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=32` : null, guildId: null };
    }
    if (ch.type === 3) return { name: ch.name || "Group DM", icon: null, guildId: null };
    const g = common.GuildStore?.getGuild?.(ch.guild_id);
    return { name: `#${ch.name}`, icon: g?.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=32` : null, guildId: ch.guild_id };
}

/** Images and videos in a channel's loaded messages, oldest first */
function channelMedia(channelId: string, kinds: ("image" | "video")[] = ["image"]) {
    const out: { url: string; name: string; kind: "image" | "video"; messageId: string; w?: number; h?: number }[] = [];
    for (const m of common.MessageStore?.getMessages?.(channelId)?._array ?? []) {
        for (const a of m.attachments ?? []) {
            const ct = String(a.content_type ?? "");
            const kind = ct.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(a.filename) ? "video" : ct.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.filename) ? "image" : null;
            if (kind && kinds.includes(kind)) out.push({ url: a.url, name: a.filename, kind, messageId: m.id, w: a.width, h: a.height });
        }
        for (const e of m.embeds ?? []) {
            const img = e.image?.url ?? (e.type === "image" ? e.thumbnail?.url : null);
            if (img && kinds.includes("image")) out.push({ url: e.image?.proxyURL ?? img, name: img.split("/").pop()?.split("?")[0] || "image", kind: "image", messageId: m.id });
            if (e.video?.url && kinds.includes("video") && !/youtube|youtu\.be|twitch/.test(e.url ?? "")) out.push({ url: e.video.proxyURL ?? e.video.url, name: e.video.url.split("/").pop()?.split("?")[0] || "video.mp4", kind: "video", messageId: m.id });
        }
    }
    return out;
}

/** Saves a Discord-hosted file with its real name (asks where, or into a folder for several) */
async function saveFiles(files: { url: string; name: string }[]) {
    if (!files.length) return;
    try {
        const n = await native.saveFiles(files);
        if (n) ui.toast(`Saved ${n} file${n > 1 ? "s" : ""}.`, { type: "ok" });
    } catch (e: any) { ui.toast("Couldn't save: " + String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""), { type: "danger" }); }
}

export default [
    definePlugin({
        name: "ChannelTabs",
        description: "Browser-style tabs for channels and DMs in Discord's title bar. Click + for a new tab, Ctrl+Tab to switch, middle-click or × to close.",
        authors: ["Vanta"], category: "Utility", since: "0.6.0",
        needsWebpack: true,
        tabs: [] as string[], active: 0,
        save() { storage.set("ChannelTabs", { tabs: this.tabs, active: this.active }, 1000); },
        render() {
            const bar = document.querySelector<HTMLElement>('[class*="bar_"] [class*="title_"]')?.parentElement ?? document.querySelector<HTMLElement>('[class*="bar_"]');
            if (!bar) return;
            let box = document.getElementById("vanta-tabs");
            if (!box) { box = h("div", { id: "vanta-tabs" }); bar.append(box); }
            const Read = common.ReadStateStore;
            box.replaceChildren(...this.tabs.map((id: string, i: number) => {
                const l = channelLabel(id);
                const unread = i !== this.active && (Read?.hasUnread?.(id) || Read?.getMentionCount?.(id) > 0);
                const tab = h("div", { class: "vanta-tab" + (i === this.active ? " on" : ""), title: l.name, onmousedown: (e: MouseEvent) => { if (e.button === 1) { e.preventDefault(); this.close(i); } } },
                    l.icon ? h("img", { src: l.icon, alt: "" }) : null,
                    h("span", {}, l.name),
                    unread ? h("i", { class: "vanta-tab-dot" }) : null,
                    this.tabs.length > 1 ? h("button", { type: "button", "aria-label": `Close ${l.name}`, onclick: (e: Event) => { e.stopPropagation(); this.close(i); } }, "×") : null);
                tab.addEventListener("click", () => this.select(i));
                return tab;
            }), h("button", { type: "button", class: "vanta-tab-new", "aria-label": "New tab", title: "New tab (same channel)", onclick: () => this.open() }, "+"));
        },
        select(i: number) {
            if (!this.tabs[i]) return;
            this.active = i; this.save(); this.render();
            const cur = common.SelectedChannelStore?.getChannelId?.();
            if (cur !== this.tabs[i]) { this.navigating = true; discord.jumpTo(this.tabs[i]); }
        },
        open(id?: string) {
            const cur = id ?? common.SelectedChannelStore?.getChannelId?.();
            if (!cur) return;
            this.tabs.splice(this.active + 1, 0, cur);
            this.active++;
            this.save(); this.render();
        },
        close(i: number) {
            if (this.tabs.length < 2) return;
            this.tabs.splice(i, 1);
            if (this.active >= this.tabs.length) this.active = this.tabs.length - 1;
            else if (i < this.active) this.active--;
            this.save();
            this.select(this.active);
        },
        async start() {
            const saved = await storage.get<{ tabs: string[]; active: number }>("ChannelTabs");
            this.tabs = (saved?.tabs ?? []).filter(id => common.ChannelStore?.getChannel?.(id));
            this.active = Math.min(saved?.active ?? 0, Math.max(0, this.tabs.length - 1));
            const cur = common.SelectedChannelStore?.getChannelId?.();
            if (!this.tabs.length && cur) this.tabs = [cur];
            this.style = managedStyle("vanta-tabs");
            this.style.set(`#vanta-tabs { position: absolute; left: 50%; top: 0; transform: translateX(-50%); height: 100%; max-width: 60%; display: flex; align-items: center; gap: 4px; -webkit-app-region: no-drag; overflow: hidden; z-index: 5; }
[class*="bar_"] [class*="title_"] { visibility: hidden; }
.vanta-tab { display: flex; align-items: center; gap: 6px; height: 24px; max-width: 170px; padding: 0 6px 0 8px; border-radius: 6px; cursor: pointer; font-size: 12.5px; color: var(--text-muted); background: transparent; white-space: nowrap; }
.vanta-tab:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.vanta-tab.on { background: var(--background-modifier-selected, rgba(255,255,255,.08)); color: var(--header-primary, #fff); }
.vanta-tab span { overflow: hidden; text-overflow: ellipsis; }
.vanta-tab img { width: 16px; height: 16px; border-radius: 50%; flex: none; }
.vanta-tab button, .vanta-tab-new { all: unset; cursor: pointer; width: 16px; height: 16px; display: grid; place-items: center; border-radius: 4px; color: var(--text-muted); font-size: 14px; line-height: 1; }
.vanta-tab button:hover, .vanta-tab-new:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.vanta-tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-normal); flex: none; }`);
            // Clicking a channel in the sidebar changes the current tab (like typing in a browser tab)
            let t: ReturnType<typeof setTimeout>;
            this.offs = [
                onFlux("CHANNEL_SELECT", ({ channelId }: any) => {
                    if (!channelId) return;
                    if (this.navigating) { this.navigating = false; }
                    else {
                        const at = this.tabs.indexOf(channelId);
                        if (at >= 0) this.active = at; else this.tabs[this.active] = channelId;
                        this.save();
                    }
                    this.render();
                }),
                // unread dots, at most twice a second
                onFlux("MESSAGE_CREATE", () => { clearTimeout(t); t = setTimeout(() => this.render(), 500); }),
            ];
            this.onKey = (e: KeyboardEvent) => {
                if (e.ctrlKey && e.key === "Tab" && this.tabs.length > 1) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    this.select((this.active + (e.shiftKey ? -1 : 1) + this.tabs.length) % this.tabs.length);
                }
            };
            document.addEventListener("keydown", this.onKey, true);
            this.render();
            this.unwatch = watchElements('[class*="bar_"]', () => this.render()); // the title bar is rebuilt sometimes
        },
        stop() {
            this.offs?.forEach((f: () => void) => f()); this.unwatch?.();
            document.removeEventListener("keydown", this.onKey, true);
            document.getElementById("vanta-tabs")?.remove(); this.style?.remove();
        },
    }),

    definePlugin({
        name: "VantaSwitcher",
        description: "Ctrl+Shift+K: one search for channels, DMs, friends, Vanta settings pages, plugins (to turn on or off), bookmarks and loaded messages.",
        authors: ["Vanta"], category: "Utility", since: "0.6.0",
        needsWebpack: true,
        async items(q: string) {
            const out: { label: string; hint: string; icon?: string | null; run: () => void; score: number }[] = [];
            const words = q.toLowerCase().split(/\s+/).filter(Boolean);
            const score = (text: string) => {
                const t = text.toLowerCase();
                if (!words.length) return 1;
                let s = 0;
                for (const w of words) { const i = t.indexOf(w); if (i < 0) return 0; s += i === 0 ? 3 : t[i - 1] === " " || t[i - 1] === "#" ? 2 : 1; }
                return s;
            };
            const add = (label: string, hint: string, run: () => void, boost = 0, icon: string | null = null) => { const s = score(label + " " + hint); if (s) out.push({ label, hint, run, score: s + boost, icon }); };
            // Channels in every server
            for (const g of Object.values(common.GuildStore?.getGuilds?.() ?? {}) as any[]) {
                for (const c of (common.GuildChannelStore?.getChannels?.(g.id)?.SELECTABLE ?? []).map((x: any) => x.channel)) {
                    if (c) add(`#${c.name}`, g.name, () => discord.jumpTo(c.id), 1);
                }
            }
            // DMs and friends
            for (const ch of Object.values(common.ChannelStore?.getMutablePrivateChannels?.() ?? {}) as any[]) {
                const l = channelLabel(ch.id);
                add(l.name, ch.type === 3 ? "Group DM" : "DM", () => discord.jumpTo(ch.id), 2, l.icon);
            }
            for (const id of common.RelationshipStore?.getFriendIDs?.() ?? []) {
                const u = common.UserStore?.getUser?.(id);
                if (u && !common.ChannelStore?.getDMFromUserId?.(id)) add(nameOf(u), `Friend · @${u.username}`, async () => discord.jumpTo(await discord.dmChannel(id)), 1);
            }
            // Vanta pages and plugins
            const V = (window as any).Vanta;
            for (const p of V?.ui?.pages ?? []) add(p.label, "Vanta settings", () => V.ui.open(p.id), 1);
            for (const p of plugins.values()) {
                const on = isPluginEnabled(p.name);
                add(p.name, `Plugin · ${on ? "on: Enter turns it off" : "off: Enter turns it on"}`, () => { setPluginEnabled(p.name, !on); ui.toast(`${p.name} turned ${on ? "off" : "on"}.`); });
            }
            if (words.length) {
                for (const b of (await storage.get<any[]>("Bookmarks")) ?? []) add(`${b.author}: ${String(b.content).slice(0, 80)}`, `Bookmark · ${b.where}`, () => discord.jumpTo(b.channelId, b.messageId));
                // Messages Discord has loaded
                const sample = common.MessageStore?.getMessages?.(common.SelectedChannelStore?.getChannelId?.() ?? "0");
                let n = 0;
                for (const [cid, cm] of Object.entries((sample?.constructor as any)?._channelMessages ?? {})) {
                    for (const m of ((cm as any)?._array ?? []) as any[]) {
                        if (n > 400) break;
                        if (!m.content) continue;
                        const s = score(m.content);
                        if (s >= words.length) { n++; out.push({ label: `${nameOf(m.author)}: ${m.content.slice(0, 80)}`, hint: `Message · ${channelLabel(cid).name}`, run: () => discord.jumpTo(cid, m.id), score: s - 1 }); }
                    }
                }
            }
            return out.sort((a, b) => b.score - a.score).slice(0, 40);
        },
        open() {
            if (document.getElementById("vanta-switcher")) return;
            const input = h("input", { placeholder: "Jump to a channel, DM, friend, setting, plugin or message…", "aria-label": "Search" }) as HTMLInputElement;
            const list = h("div", { class: "vs-list", role: "listbox" });
            let results: any[] = [], sel = 0, seq = 0;
            const close = () => back.remove();
            const draw = () => list.replaceChildren(...results.map((r, i) => {
                const row = h("div", { class: "vs-row" + (i === sel ? " on" : ""), role: "option", onclick: () => { close(); r.run(); } },
                    r.icon ? h("img", { src: r.icon, alt: "" }) : h("i", {}), h("span", { class: "vs-label" }, r.label), h("span", { class: "vs-hint" }, r.hint));
                return row;
            }));
            const search = async () => { const my = ++seq; const r = await this.items(input.value); if (my !== seq) return; results = r; sel = 0; draw(); };
            let t: ReturnType<typeof setTimeout>;
            input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(search, 60); });
            input.addEventListener("keydown", e => {
                e.stopPropagation();
                if (e.key === "Escape") return close();
                if (e.key === "ArrowDown") { sel = Math.min(results.length - 1, sel + 1); draw(); list.children[sel]?.scrollIntoView({ block: "nearest" }); e.preventDefault(); }
                if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); list.children[sel]?.scrollIntoView({ block: "nearest" }); e.preventDefault(); }
                if (e.key === "Enter" && results[sel]) { close(); results[sel].run(); }
            });
            const back = h("div", { id: "vanta-switcher", "data-no-focus-lock": "true", onmousedown: (e: MouseEvent) => { if (e.target === back) close(); } },
                h("div", { class: "vs-box" }, input, list));
            document.body.append(back);
            input.focus();
            search();
        },
        start() {
            this.style = managedStyle("vanta-switcher");
            this.style.set(`#vanta-switcher { position: fixed; inset: 0; z-index: 100003; background: rgba(0,0,0,.55); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
#vanta-switcher .vs-box { width: min(620px, 92vw); background: var(--background-base-low, #1f1f24); border: 1px solid var(--background-modifier-accent); border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
#vanta-switcher input { all: unset; box-sizing: border-box; width: 100%; padding: 16px 18px; font-size: 17px; color: var(--text-normal); border-bottom: 1px solid var(--background-modifier-accent); }
#vanta-switcher .vs-list { max-height: 50vh; overflow-y: auto; padding: 6px; }
#vanta-switcher .vs-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; color: var(--text-normal); }
#vanta-switcher .vs-row.on, #vanta-switcher .vs-row:hover { background: var(--background-modifier-selected, rgba(255,255,255,.08)); }
#vanta-switcher .vs-row img, #vanta-switcher .vs-row i { width: 20px; height: 20px; border-radius: 50%; flex: none; }
#vanta-switcher .vs-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#vanta-switcher .vs-hint { font-size: 12px; color: var(--text-muted); white-space: nowrap; }`);
            this.onKey = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.code === "KeyK") { e.preventDefault(); e.stopImmediatePropagation(); this.open(); } };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); this.style?.remove(); document.getElementById("vanta-switcher")?.remove(); },
    }),

    definePlugin({
        name: "MediaViewer",
        description: "Click an image in chat for a better viewer: scroll to zoom, drag to pan, R to rotate, arrow keys for the channel's other images, and Save with the real filename.",
        authors: ["Vanta"], category: "Chat", since: "0.6.0",
        needsWebpack: true,
        show(list: { url: string; name: string }[], index: number) {
            let i = index, zoom = 1, rot = 0, px = 0, py = 0;
            const img = h("img", { alt: "", draggable: false }) as HTMLImageElement;
            const info = h("div", { class: "mv-info" });
            const apply = () => { img.style.transform = `translate(${px}px, ${py}px) scale(${zoom}) rotate(${rot}deg)`; };
            const load = () => { zoom = 1; rot = 0; px = py = 0; img.src = list[i].url; info.textContent = `${list[i].name} · ${i + 1} of ${list.length}`; apply(); };
            const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
            const step = (d: number) => { if (list.length > 1) { i = (i + d + list.length) % list.length; load(); } };
            const onKey = (e: KeyboardEvent) => {
                const k = e.key;
                if (!["Escape", "ArrowLeft", "ArrowRight", "r", "R", "+", "=", "-", "0", "s", "S"].includes(k)) return;
                e.preventDefault(); e.stopImmediatePropagation();
                if (k === "Escape") close();
                else if (k === "ArrowLeft") step(-1); else if (k === "ArrowRight") step(1);
                else if (k === "r" || k === "R") { rot = (rot + 90) % 360; apply(); }
                else if (k === "+" || k === "=") { zoom = Math.min(10, zoom * 1.25); apply(); }
                else if (k === "-") { zoom = Math.max(0.2, zoom / 1.25); apply(); }
                else if (k === "0") { zoom = 1; px = py = 0; apply(); }
                else if (k === "s" || k === "S") saveFiles([list[i]]);
            };
            const btn = (label: string, fn: () => void) => h("button", { type: "button", onclick: (e: Event) => { e.stopPropagation(); fn(); } }, label);
            const back = h("div", { id: "vanta-viewer", "data-no-focus-lock": "true", onmousedown: (e: MouseEvent) => { if (e.target === back) close(); } },
                img, info,
                h("div", { class: "mv-bar" },
                    list.length > 1 ? btn("‹", () => step(-1)) : null,
                    btn("−", () => { zoom = Math.max(0.2, zoom / 1.25); apply(); }), btn("+", () => { zoom = Math.min(10, zoom * 1.25); apply(); }),
                    btn("⟳", () => { rot = (rot + 90) % 360; apply(); }), btn("Save", () => saveFiles([list[i]])),
                    btn("Open original", () => native.openUrl(list[i].url)),
                    list.length > 1 ? btn("›", () => step(1)) : null, btn("✕", close)));
            back.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.min(10, Math.max(0.2, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); apply(); }, { passive: false });
            let drag: { x: number; y: number } | null = null;
            img.addEventListener("pointerdown", e => { drag = { x: e.clientX - px, y: e.clientY - py }; img.setPointerCapture(e.pointerId); });
            img.addEventListener("pointermove", e => { if (drag) { px = e.clientX - drag.x; py = e.clientY - drag.y; apply(); } });
            img.addEventListener("pointerup", () => { drag = null; });
            document.addEventListener("keydown", onKey, true);
            document.body.append(back);
            load();
        },
        start() {
            this.style = managedStyle("vanta-viewer");
            this.style.set(`#vanta-viewer { position: fixed; inset: 0; z-index: 100004; background: rgba(0,0,0,.88); display: grid; place-items: center; overflow: hidden; }
#vanta-viewer img { max-width: 90vw; max-height: 82vh; transition: transform .08s; cursor: grab; user-select: none; }
#vanta-viewer .mv-info { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); color: #ddd; font-size: 13px; background: rgba(0,0,0,.5); padding: 4px 10px; border-radius: 6px; }
#vanta-viewer .mv-bar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; background: rgba(20,20,24,.85); padding: 6px; border-radius: 10px; }
#vanta-viewer .mv-bar button { all: unset; cursor: pointer; color: #eee; padding: 6px 12px; border-radius: 6px; font-size: 14px; }
#vanta-viewer .mv-bar button:hover { background: rgba(255,255,255,.12); }`);
            // Open our viewer instead of Discord's when an image in chat is clicked
            this.onClick = (e: MouseEvent) => {
                if (e.button !== 0 || e.ctrlKey || e.shiftKey) return;
                const target = e.target as Element;
                const img = target?.closest?.('[id^="chat-messages-"] [class*="imageWrapper_"] img, [id^="chat-messages-"] [class*="imageContainer_"] img') as HTMLImageElement | null;
                if (!img) return;
                const msgEl = img.closest('[id^="chat-messages-"]')!;
                const channelId = msgEl.id.split("-")[2];
                const list = channelMedia(channelId, ["image"]);
                const base = (u: string) => u.split("?")[0].split("/").slice(-2).join("/");
                let i = list.findIndex(x => base(x.url) === base(img.src));
                if (i < 0) { list.push({ url: img.src.replace(/\?.*$/, ""), name: img.alt || "image", kind: "image", messageId: "" }); i = list.length - 1; }
                e.preventDefault(); e.stopImmediatePropagation();
                this.show(list, i);
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); this.style?.remove(); document.getElementById("vanta-viewer")?.remove(); },
    }),

    definePlugin({
        name: "ImageGallery",
        description: "Ctrl+Shift+G shows every image in the channel you're in as a grid (scroll to load older ones). Click to view, or save them all at once.",
        authors: ["Vanta"], category: "Utility", since: "0.6.0",
        needsWebpack: true,
        async open() {
            const channelId = common.SelectedChannelStore?.getChannelId?.();
            if (!channelId) return ui.toast("Open a channel first.");
            const items = channelMedia(channelId, ["image"]).reverse();
            let before = (common.MessageStore?.getMessages?.(channelId)?._array ?? [])[0]?.id;
            const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "6px", maxHeight: "62vh", overflowY: "auto" } });
            const status = h("div", { class: "vanta-item-desc" });
            const add = (list: typeof items) => grid.append(...list.map(x => h("img", {
                src: x.url + (x.url.includes("?") ? "&" : "?") + "width=280&height=280", alt: x.name, loading: "lazy", title: x.name,
                style: { width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "6px", cursor: "pointer", background: "var(--background-secondary)" },
                onclick: () => { const mv = plugins.get("MediaViewer") as any; if (mv?.show) mv.show(items, items.indexOf(x)); else native.openUrl(x.url); },
            })));
            add(items);
            status.textContent = `${items.length} image${items.length === 1 ? "" : "s"}`;
            // Older images: one page of 100 messages at a time, when you scroll to the bottom
            let loading = false, done = !before;
            grid.addEventListener("scroll", async () => {
                if (loading || done || grid.scrollTop + grid.clientHeight < grid.scrollHeight - 200) return;
                loading = true; status.textContent = "Loading older images…";
                try {
                    const res = await discord.api().get({ url: `/channels/${channelId}/messages`, query: { limit: 100, before } });
                    const msgs: any[] = res?.body ?? [];
                    if (!msgs.length) done = true; else before = msgs[msgs.length - 1].id;
                    const more = msgs.flatMap(m => (m.attachments ?? []).filter((a: any) => String(a.content_type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.filename)).map((a: any) => ({ url: a.url, name: a.filename, kind: "image" as const, messageId: m.id })));
                    items.push(...more); add(more);
                } catch { done = true; }
                loading = false; status.textContent = `${items.length} image${items.length === 1 ? "" : "s"}${done ? "" : " · scroll for older"}`;
            });
            ui.modal({
                title: `Images in ${channelLabel(channelId).name}`,
                body: h("div", { style: { display: "grid", gap: "8px" } }, status, items.length ? grid : ui.empty("No images loaded in this channel yet. Scroll up in the chat, or scroll down here.", "info"), items.length ? null : grid),
                buttons: [{ text: "Save all", variant: "ghost", onClick: () => { saveFiles(items); return false; } }, { text: "Close", variant: "primary" }],
            });
        },
        start() {
            this.onKey = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.code === "KeyG") { e.preventDefault(); e.stopImmediatePropagation(); this.open(); } };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),

    definePlugin({
        name: "VideoDownloader",
        description: "Adds a download button to videos posted in chat that saves them with their real filename.",
        authors: ["Vanta"], category: "Chat", since: "0.6.0",
        needsWebpack: true,
        start() {
            this.style = managedStyle("vanta-video-dl");
            this.style.set(`.vanta-video-dl { position: absolute; top: 8px; right: 8px; z-index: 3; all: unset; position: absolute; top: 8px; right: 8px; cursor: pointer; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; color: #fff; background: rgba(0,0,0,.6); opacity: 0; transition: opacity .15s; }
[class*="wrapperPlaying_"]:hover .vanta-video-dl, [class*="videoWrapper_"]:hover .vanta-video-dl, [class*="wrapperPaused_"]:hover .vanta-video-dl, .vanta-video-host:hover .vanta-video-dl { opacity: 1; }`);
            this.unwatch = watchElements('[id^="chat-messages-"] video', (video: HTMLElement) => {
                const v = video as HTMLVideoElement;
                const host = v.parentElement;
                if (!host || host.querySelector(".vanta-video-dl")) return;
                const src = v.currentSrc || v.src || v.querySelector("source")?.src;
                if (!src || /youtube|twitch/.test(src)) return;
                host.classList.add("vanta-video-host");
                if (getComputedStyle(host).position === "static") host.style.position = "relative";
                const name = decodeURIComponent(src.split("?")[0].split("/").pop() || "video.mp4");
                host.append(h("button", { type: "button", class: "vanta-video-dl", title: `Save ${name}`, onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); saveFiles([{ url: src.split("?")[0].replace("media.discordapp.net", "cdn.discordapp.com") + (src.includes("?") ? "?" + src.split("?")[1] : ""), name }]); } }, "⤓ Save"));
            });
        },
        stop() { this.unwatch?.(); this.style?.remove(); document.querySelectorAll(".vanta-video-dl").forEach(e => e.remove()); },
    }),

    definePlugin({
        name: "MuteOverlay",
        description: "A small always-on-top indicator in the corner of your screen that shows when you're muted or deafened, even when Discord is behind other windows.",
        authors: ["Vanta"], category: "Utility", since: "0.6.0",
        needsWebpack: true,
        options: {
            corner: { type: "select", default: "top-right", label: "Corner", options: [{ value: "top-left", label: "Top left" }, { value: "top-right", label: "Top right" }, { value: "bottom-left", label: "Bottom left" }, { value: "bottom-right", label: "Bottom right" }] },
            onlyInCall: { type: "boolean", default: true, label: "Only while I'm in a voice channel" },
        },
        update() {
            const M = this.Media;
            const inCall = !!common.SelectedChannelStore?.getVoiceChannelId?.();
            const deaf = !!M?.isSelfDeaf?.(), mute = !!M?.isSelfMute?.() || deaf;
            const state = (!inCall && this.settings.onlyInCall) || (!mute && !deaf) ? "hidden" : deaf ? "deafened" : "muted";
            if (state === this.last) return;
            this.last = state;
            native.muteOverlay(state, this.settings.corner).catch(() => { });
        },
        start() {
            this.Media = webpack.findStore("MediaEngineStore");
            if (!this.Media) throw new Error("Discord's voice store wasn't found");
            this.last = null;
            const later = () => setTimeout(() => this.update(), 0);
            this.offs = ["AUDIO_TOGGLE_SELF_MUTE", "AUDIO_TOGGLE_SELF_DEAF", "AUDIO_SET_SELF_MUTE", "AUDIO_SET_SELF_DEAF", "VOICE_CHANNEL_SELECT", "RTC_CONNECTION_STATE"].map(t => onFlux(t, later));
            this.update();
        },
        onSettingChange() { if (this.started) { this.last = null; this.update(); } },
        stop() { this.offs?.forEach((f: () => void) => f()); native.muteOverlay("hidden", "").catch(() => { }); },
    }),

    definePlugin({
        name: "StreamPrivacy",
        description: "While you're streaming or sharing your screen, blurs your DM list, server names, message previews and emails, and unblurs on hover.",
        authors: ["Vanta"], category: "Privacy", since: "0.6.0",
        needsWebpack: true,
        options: { always: { type: "boolean", default: false, label: "Blur all the time, not just while streaming" } },
        css: `body.vanta-streaming [class*="privateChannels_"] [class*="name_"], body.vanta-streaming [class*="privateChannels_"] [class*="subText_"],
body.vanta-streaming [class*="guilds_"] [class*="blobContainer_"] img, body.vanta-streaming [class*="guildIcon_"], body.vanta-streaming [class*="childWrapper_"],
body.vanta-streaming [class*="sidebar_"] header [class*="name_"], body.vanta-streaming [class*="panels_"] [class*="nameTag_"],
body.vanta-streaming [class*="privateChannels_"] img[class*="avatar_"] { filter: blur(6px); transition: filter .15s; }
body.vanta-streaming [class*="privateChannels_"] a:hover [class*="name_"], body.vanta-streaming [class*="privateChannels_"] a:hover img,
body.vanta-streaming [class*="guilds_"] [class*="blobContainer_"]:hover img { filter: none; }`,
        update() {
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const streams = this.Streams?.getAllActiveStreams?.() ?? [];
            const streaming = this.settings.always || streams.some((s: any) => s?.ownerId === me);
            document.body.classList.toggle("vanta-streaming", !!streaming);
        },
        start() {
            this.Streams = webpack.findStore("ApplicationStreamingStore");
            this.styleEl = managedStyle("vanta-stream-privacy");
            this.styleEl.set(this.css);
            const later = () => setTimeout(() => this.update(), 300);
            this.offs = ["STREAM_START", "STREAM_STOP", "STREAM_CREATE", "STREAM_DELETE", "STREAM_UPDATE"].map(t => onFlux(t, later));
            this.update();
        },
        onSettingChange() { if (this.started) this.update(); },
        stop() { this.offs?.forEach((f: () => void) => f()); this.styleEl?.remove(); document.body.classList.remove("vanta-streaming"); },
    }),
];
