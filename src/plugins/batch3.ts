// More quality-of-life plugins (BetterDiscord/Vencord-style features, written from scratch).
import { definePlugin, cssPlugin, common, webpack, ui, native, watchElements, messageFromElement, managedStyle, copyText, net, SEND_OR_EDIT_URL } from "@api";

const MESSAGE = '[id^="chat-messages-"]';
const typingIn = (el: Element | null) => !!el && ((el as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export default [
    definePlugin({
        name: "CopyEmojiMarkdown",
        description: "Shift+click a custom emoji in chat to copy its code (like <:pog:1234>) so you can use it elsewhere.",
        authors: ["Vanta"], category: "Utility",
        start() {
            this.onClick = async (e: MouseEvent) => {
                if (!e.shiftKey || e.ctrlKey || e.altKey) return;
                const img = (e.target as Element).closest?.('[id^="message-content-"] img[src*="/emojis/"], [id^="message-reactions-"] img[src*="/emojis/"]') as HTMLImageElement | null;
                const m = img?.src.match(/\/emojis\/(\d+)\.(\w+)/);
                if (!img || !m) return;
                e.preventDefault(); e.stopImmediatePropagation();
                const name = (img.alt || img.getAttribute("data-name") || "emoji").replace(/:/g, "") || "emoji";
                const animated = m[2] === "gif" || /animated=true/.test(img.src);
                await copyText(`<${animated ? "a" : ""}:${name}:${m[1]}>`);
                ui.toast(`Copied :${name}:`, { type: "ok", ms: 1800 });
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),

    definePlugin({
        name: "ImageZoom",
        description: "When you open an image, scroll to zoom in where your mouse is. Click to reset.",
        authors: ["Vanta"], category: "Utility",
        start() {
            const scale = new WeakMap<HTMLElement, number>();
            this.onWheel = (e: WheelEvent) => {
                const img = (e.target as Element).closest?.('[role="dialog"] img, [class*="layer_"] img[class*="image"]') as HTMLImageElement | null;
                if (!img || img.closest('[id^="chat-messages-"]') || img.naturalWidth < 64) return;
                e.preventDefault();
                const r = img.getBoundingClientRect();
                const s = Math.min(8, Math.max(1, (scale.get(img) ?? 1) * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
                scale.set(img, s);
                img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
                img.style.transform = s === 1 ? "" : `scale(${s})`;
                img.style.transition = "transform .08s ease-out";
            };
            this.onClick = (e: MouseEvent) => {
                const img = (e.target as Element).closest?.("img") as HTMLImageElement | null;
                if (img && scale.get(img) && scale.get(img)! > 1) { scale.set(img, 1); img.style.transform = ""; e.stopPropagation(); }
            };
            document.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
            document.addEventListener("click", this.onClick, true);
        },
        stop() {
            document.removeEventListener("wheel", this.onWheel, { capture: true } as any);
            document.removeEventListener("click", this.onClick, true);
        },
    }),

    definePlugin({
        name: "MemberCount",
        description: "Shows how many members a server has, and how many are online, at the top of the member list.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        render() {
            const list = document.querySelector('aside[class*="membersWrap_"]');
            const gid = common.SelectedGuildStore?.getGuildId?.();
            const cid = common.SelectedChannelStore?.getChannelId?.();
            if (!list || !gid) { this.el?.remove(); return; }
            const total = this.Counts?.getMemberCount?.(gid);
            const groups = this.Members?.getProps?.(gid, cid)?.groups ?? [];
            const online = groups.filter((g: any) => g.id !== "offline").reduce((n: number, g: any) => n + (g.count || 0), 0);
            if (total == null) return;
            this.el ??= Object.assign(document.createElement("div"), { className: "vanta-member-count" });
            this.el.replaceChildren();
            const dot = (c: string) => Object.assign(document.createElement("i"), { style: `background:${c}` });
            this.el.append(dot("var(--status-positive, #3ba55c)"), `${online.toLocaleString()} online`, dot("var(--text-muted, #999)"), `${Number(total).toLocaleString()} members`);
            const scroller = list.querySelector('[class*="scroller_"]') ?? list;
            if (this.el.parentElement !== scroller) scroller.prepend(this.el);
        },
        start() {
            this.Counts = webpack.findStore("GuildMemberCountStore");
            this.Members = webpack.findStore("ChannelMemberStore");
            if (!this.Counts) throw new Error("Discord's member count store wasn't found");
            this.style = managedStyle("vanta-member-count");
            this.style.set(`.vanta-member-count { display:flex; align-items:center; gap:6px; padding:12px 16px 4px; font:600 12px var(--font-primary, sans-serif); color:var(--text-muted); text-transform:uppercase; letter-spacing:.02em; }
.vanta-member-count i { width:8px; height:8px; border-radius:50%; display:inline-block; }
.vanta-member-count i:last-of-type { margin-left:8px; }`);
            this.timer = setInterval(() => this.render(), 2000);
            this.render();
        },
        stop() { clearInterval(this.timer); this.el?.remove(); this.el = null; this.style?.remove(); },
    }),

    definePlugin({
        name: "Unindent",
        description: "Removes extra indentation from code blocks you send, so pasted code isn't pushed to the right.",
        authors: ["Vanta"], category: "Chat",
        start() {
            this.off = net.transform(({ method, url, body }) => {
                if (!/^(POST|PATCH)$/.test(method) || !SEND_OR_EDIT_URL.test(url)) return;
                const data = JSON.parse(body);
                if (typeof data.content !== "string" || !data.content.includes("```")) return;
                const out = data.content.replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
                    const lines = code.split("\n");
                    const indents = lines.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)![0].length);
                    const min = indents.length ? Math.min(...indents) : 0;
                    return "```" + lang + "\n" + lines.map(l => l.slice(min)).join("\n") + "```";
                });
                if (out === data.content) return;
                data.content = out;
                return JSON.stringify(data);
            });
        },
        stop() { this.off?.(); },
    }),

    definePlugin({
        name: "CallTimer",
        description: "Shows how long you've been in a voice call, above your user panel.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        start() {
            this.style = managedStyle("vanta-call-timer");
            this.style.set(`.vanta-call-timer { padding:6px 12px; font:600 12px var(--font-code, monospace); color:var(--status-positive, #3ba55c); display:flex; gap:6px; align-items:center; }
.vanta-call-timer::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }`);
            let since = 0, channel: string | null = null;
            const fmt = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n, i) => i ? String(n).padStart(2, "0") : n).join(":").replace(/^0:/, "");
            this.timer = setInterval(() => {
                const now = common.SelectedChannelStore?.getVoiceChannelId?.() ?? null;
                if (now !== channel) { channel = now; since = Date.now(); }
                const panel = document.querySelector('[class*="panels_"]');
                if (!now || !panel) { this.el?.remove(); return; }
                this.el ??= Object.assign(document.createElement("div"), { className: "vanta-call-timer" });
                if (this.el.parentElement !== panel) panel.prepend(this.el);
                this.el.textContent = "In call " + fmt(Math.floor((Date.now() - since) / 1000));
            }, 1000);
        },
        stop() { clearInterval(this.timer); this.el?.remove(); this.el = null; this.style?.remove(); },
    }),

    definePlugin({
        name: "OpenInApp",
        description: "Spotify and Steam links open in their desktop apps instead of your browser.",
        authors: ["Vanta"], category: "Utility",
        options: {
            spotify: { type: "boolean", default: true, label: "Spotify" },
            steam: { type: "boolean", default: true, label: "Steam" },
        },
        appUrl(href: string) {
            const sp = href.match(/^https:\/\/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|artist|playlist|episode|show|user)\/([A-Za-z0-9]+)/);
            if (sp && this.settings.spotify) return `spotify:${sp[1]}:${sp[2]}`;
            if (this.settings.steam && /^https:\/\/(store\.steampowered\.com|steamcommunity\.com)\//.test(href)) return "steam://openurl/" + href;
            return null;
        },
        start() {
            this.onClick = (e: MouseEvent) => {
                if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey) return;
                const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
                const url = a && this.appUrl(a.href);
                if (!url) return;
                e.preventDefault(); e.stopImmediatePropagation();
                native.openAppUrl(url).catch(() => native.openUrl(a!.href));
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),

    definePlugin({
        name: "CustomRPC",
        description: "Show any \"Playing…\" status you like on your profile. Needs an Application ID from discord.com/developers.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        options: {
            appId: { type: "string", default: "", label: "Application ID", placeholder: "1234567890", description: "Create an application at discord.com/developers/applications and paste its ID." },
            name: { type: "string", default: "Vanta", label: "Name", description: "What you're \"playing\"." },
            details: { type: "string", default: "", label: "Details (line 2)" },
            state: { type: "string", default: "", label: "State (line 3)" },
            type: {
                type: "select", default: "0", label: "Activity type",
                options: [{ value: "0", label: "Playing" }, { value: "2", label: "Listening to" }, { value: "3", label: "Watching" }, { value: "5", label: "Competing in" }],
            },
            elapsed: { type: "boolean", default: true, label: "Show elapsed time" },
        },
        send(activity: any) {
            common.FluxDispatcher?.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity, socketId: "VantaCustomRPC" });
        },
        activity() {
            const s = this.settings;
            if (!/^\d{5,25}$/.test(String(s.appId).trim())) return null;
            return {
                application_id: String(s.appId).trim(),
                name: String(s.name || "Vanta"),
                details: String(s.details || "") || undefined,
                state: String(s.state || "") || undefined,
                type: Number(s.type) || 0,
                flags: 1,
                timestamps: s.elapsed ? { start: this.startedAt } : undefined,
            };
        },
        start() {
            this.startedAt = Date.now();
            const a = this.activity();
            if (!a) throw new Error("Add an Application ID in this plugin's settings first");
            this.send(a);
        },
        onSettingChange() { if (this.started) { const a = this.activity(); if (a) this.send(a); } },
        stop() { this.send(null); },
    }),

    definePlugin({
        name: "CursorPet",
        description: "A tiny void orb that follows your mouse around and dozes off when you stop moving.",
        authors: ["Vanta"], category: "Appearance",
        start() {
            const pet = Object.assign(document.createElement("div"), { className: "vanta-pet" });
            pet.setAttribute("aria-hidden", "true");
            this.style = managedStyle("vanta-pet");
            this.style.set(`.vanta-pet { position:fixed; left:0; top:0; z-index:100005; width:14px; height:14px; border-radius:50%; pointer-events:none;
  background: radial-gradient(circle at 35% 35%, #f5f3ff 0 2px, #0e0b14 3px); box-shadow: 0 0 0 2px #a78bfa, 0 0 10px rgba(139,92,246,.6); transition: opacity .3s; }
.vanta-pet.sleep::after { content:"z"; position:absolute; left:14px; top:-10px; font:700 10px var(--font-primary, sans-serif); color:#c4b5fd; animation: vanta-z 1.6s infinite; }
@keyframes vanta-z { 0% { opacity:0; transform: translate(0,4px); } 50% { opacity:1; } 100% { opacity:0; transform: translate(6px,-6px); } }`);
            document.body.append(pet);
            let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0, idle: any;
            const step = () => {
                x += (tx - x) * 0.12; y += (ty - y) * 0.12;
                pet.style.transform = `translate(${x - 7}px, ${y - 7}px)`;
                raf = Math.hypot(tx - x, ty - y) > 0.5 ? requestAnimationFrame(step) : 0; // stops when settled (no idle CPU)
            };
            this.onMove = (e: MouseEvent) => {
                tx = e.clientX + 18; ty = e.clientY + 18;
                pet.classList.remove("sleep");
                clearTimeout(idle);
                idle = setTimeout(() => pet.classList.add("sleep"), 4000);
                if (!raf) raf = requestAnimationFrame(step);
            };
            document.addEventListener("mousemove", this.onMove, { passive: true });
            this.pet = pet;
            this.cancel = () => { cancelAnimationFrame(raf); clearTimeout(idle); };
        },
        stop() { document.removeEventListener("mousemove", this.onMove); this.cancel?.(); this.pet?.remove(); this.style?.remove(); },
    }),

    definePlugin({
        name: "ThemeAttributes",
        description: "For theme makers: adds data-author-id, data-is-self and data-is-bot to messages so themes can style them.",
        authors: ["Vanta"], category: "Developer",
        needsWebpack: true,
        start() {
            const me = () => common.UserStore?.getCurrentUser?.()?.id;
            this.unwatch = watchElements(MESSAGE, li => {
                const a = messageFromElement(li)?.author;
                if (!a) return;
                li.dataset.authorId = a.id;
                li.dataset.authorUsername = a.username;
                li.dataset.isSelf = String(a.id === me());
                li.dataset.isBot = String(!!a.bot);
            });
        },
        stop() {
            this.unwatch?.();
            document.querySelectorAll<HTMLElement>("[data-author-id]").forEach(li => { delete li.dataset.authorId; delete li.dataset.authorUsername; delete li.dataset.isSelf; delete li.dataset.isBot; });
        },
    }),

    definePlugin({
        name: "ImageFilename",
        description: "Hover an image or video in chat to see its file name.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        start() {
            this.unwatch = watchElements('[id^="message-accessories-"] img, [id^="message-accessories-"] video', el => {
                const msg = messageFromElement(el);
                const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || "";
                const att = (msg?.attachments || []).find((a: any) => src.includes(a.id)) ?? (msg?.attachments?.length === 1 ? msg.attachments[0] : null);
                if (att?.filename && !el.title) { el.title = att.filename; el.dataset.vantaFilename = "1"; }
            });
        },
        stop() { this.unwatch?.(); document.querySelectorAll<HTMLElement>("[data-vanta-filename]").forEach(e => { e.removeAttribute("title"); delete e.dataset.vantaFilename; }); },
    }),

    cssPlugin({
        name: "HideMentionBars",
        description: "Hides the \"new mentions\" bars at the top and bottom of chat.",
        authors: ["Vanta"], category: "Appearance",
        css: `[class*="unreadMentionsBar_"], [class*="unreadMentionsIndicatorTop_"], [class*="unreadMentionsIndicatorBottom_"] { display: none !important; }`,
    }),

    cssPlugin({
        name: "CrispText",
        description: "Sharper, thinner text rendering (grayscale anti-aliasing).",
        authors: ["Vanta"], category: "Appearance",
        css: `body, #app-mount { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }`,
    }),

    definePlugin({
        name: "SendGuard",
        description: "Stops a message from sending if it contains words you list (an old password, a slur, a name), so you can fix it.",
        authors: ["Vanta"], category: "Chat",
        options: { words: { type: "text", default: "", label: "Block messages containing", placeholder: "one per line" } },
        start() {
            this.onKey = (e: KeyboardEvent) => {
                if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.isComposing) return;
                const box = (e.target as Element).closest?.('[role="textbox"][data-slate-editor="true"]');
                if (!box) return;
                const text = [...box.querySelectorAll('[data-slate-string="true"]')].map(s => s.textContent).join("\n").toLowerCase();
                const words = String(this.settings.words || "").split("\n").map(w => w.trim().toLowerCase()).filter(Boolean);
                const hit = words.find(w => text.includes(w));
                if (!hit) return;
                e.preventDefault(); e.stopImmediatePropagation();
                ui.toast(`Not sent: your message contains "${hit}"`, { type: "danger", ms: 5000 });
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),

    definePlugin({
        name: "KeyboardSounds",
        description: "Soft typewriter clicks while you type in the message box. Generated live, no sound files.",
        authors: ["Vanta"], category: "Appearance",
        options: { volume: { type: "number", default: 30, label: "Volume (%)" } },
        start() {
            let ctx: AudioContext | null = null;
            this.onKey = (e: KeyboardEvent) => {
                if (e.repeat || e.ctrlKey || e.metaKey || !(e.target as Element).closest?.('[role="textbox"][data-slate-editor="true"]')) return;
                ctx ??= new AudioContext();
                const vol = Math.max(0, Math.min(100, Number(this.settings.volume) || 0)) / 100;
                const len = 0.03, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6); // short decaying click
                const src = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
                filter.type = "bandpass";
                filter.frequency.value = e.key === "Enter" ? 900 : e.key === " " ? 1300 : 2200 + Math.random() * 600;
                gain.gain.value = vol * 0.6;
                src.buffer = buf;
                src.connect(filter).connect(gain).connect(ctx.destination);
                src.start();
            };
            document.addEventListener("keydown", this.onKey, true);
            this.close = () => ctx?.close();
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); this.close?.(); },
    }),
];

void typingIn;
