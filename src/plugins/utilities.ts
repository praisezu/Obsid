// Assorted quality-of-life plugins.
import { definePlugin, ui, h, native, copyText, patcher, managedStyle, settings } from "@api";

export default [
    definePlugin({
        name: "ConfirmCalls",
        description: "Asks before starting a voice or video call, so you don't ring someone by accident.",
        authors: ["Obsid"], category: "Utility",
        start() {
            const allowed = new WeakSet<Element>();
            this.onClick = async (e: MouseEvent) => {
                const btn = (e.target as Element).closest?.('[aria-label="Start Voice Call"], [aria-label="Start Video Call"]') as HTMLElement | null;
                if (!btn) return;
                if (allowed.has(btn)) { allowed.delete(btn); return; }
                e.preventDefault(); e.stopImmediatePropagation();
                const video = btn.getAttribute("aria-label")!.includes("Video");
                const ok = await ui.confirm({ title: video ? "Start a video call?" : "Start a voice call?", body: "This will ring everyone in this conversation.", confirmText: "Call" });
                if (!ok) return;
                allowed.add(btn);
                btn.click();
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),
    definePlugin({
        name: "NotificationVolume",
        description: "Makes Discord's notification and UI sounds quieter (or louder, up to normal) without touching call volume.",
        authors: ["Obsid"], category: "Utility",
        options: { volume: { type: "number", default: 40, label: "Sound volume (%)", description: "0–100. Calls and videos aren't affected." } },
        start() {
            const base = new WeakMap<HTMLMediaElement, number>(), applied = new WeakMap<HTMLMediaElement, number>();
            this.unpatch = patcher.before(HTMLMediaElement.prototype, "play", function (this: HTMLMediaElement) {
                // Discord's sounds are detached <audio> elements; videos/streams live in the page.
                if (!(this instanceof HTMLAudioElement) || this.isConnected || this.srcObject) return;
                const factor = Math.max(0, Math.min(100, Number(settings.plugins.NotificationVolume?.options?.volume ?? 40))) / 100;
                if (applied.get(this) !== this.volume) base.set(this, this.volume); // Discord changed it since
                const v = (base.get(this) ?? this.volume) * factor;
                this.volume = v;
                applied.set(this, this.volume);
            });
        },
        stop() { this.unpatch?.(); },
    }),
    definePlugin({
        name: "BetterTitle",
        description: "Cleaner window title: drops the \"Discord |\" prefix and can show your unread count first.",
        authors: ["Obsid"], category: "Utility",
        options: { prefix: { type: "string", default: "", label: "Custom prefix", placeholder: "Obsid", description: "Optional text shown before the title." } },
        start() {
            const fix = () => {
                const t = document.title;
                let out = t.replace(/^(\(\d+\)\s*)?Discord\s*\|\s*/, "$1");
                const p = String(this.settings.prefix || "").trim();
                if (p && !out.startsWith(p)) out = `${p} | ${out}`;
                if (out !== t) document.title = out;
            };
            this.observer = new MutationObserver(fix);
            const title = document.querySelector("title");
            if (title) this.observer.observe(title, { childList: true, characterData: true, subtree: true });
            fix();
        },
        stop() { this.observer?.disconnect(); },
    }),
    definePlugin({
        name: "CopyImageLink",
        description: "Shift+click an image in chat to copy its link.",
        authors: ["Obsid"], category: "Utility",
        start() {
            this.onClick = async (e: MouseEvent) => {
                if (!e.shiftKey || e.ctrlKey || e.altKey || e.button !== 0) return;
                const img = (e.target as Element).closest?.('[id^="message-accessories-"] img, [id^="message-accessories-"] video') as HTMLImageElement | HTMLVideoElement | null;
                const src = img && ((img as HTMLImageElement).currentSrc || img.src);
                if (!src || !/^https:/.test(src)) return;
                e.preventDefault(); e.stopImmediatePropagation();
                // Proxied previews → the original file
                const u = new URL(src);
                if (u.hostname === "media.discordapp.net" && u.pathname.startsWith("/attachments/")) {
                    u.hostname = "cdn.discordapp.com";
                    for (const k of [...u.searchParams.keys()]) if (!["ex", "is", "hm"].includes(k)) u.searchParams.delete(k);
                }
                await copyText(u.href);
                ui.toast("Copied image link", { type: "ok" });
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),
    definePlugin({
        name: "DevToolsKeybind",
        description: "Ctrl+Shift+I or F12 opens DevTools (Discord blocks these by default).",
        authors: ["Obsid"], category: "Developer",
        start() {
            this.onKey = (e: KeyboardEvent) => {
                if (e.key === "F12" || (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyI")) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    native.toggleDevTools();
                }
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),
    definePlugin({
        name: "F5Reload",
        description: "F5 reloads Discord, like a browser (Ctrl+R still works too).",
        authors: ["Obsid"], category: "Utility",
        start() {
            this.onKey = (e: KeyboardEvent) => {
                if (e.key !== "F5" || e.ctrlKey || e.altKey) return;
                e.preventDefault(); e.stopImmediatePropagation();
                location.reload();
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),
    definePlugin({
        name: "ThemeHelper",
        description: "For theme makers: Ctrl+Alt+Shift+click anything to copy a selector for it that survives Discord updates.",
        authors: ["Obsid"], category: "Developer",
        selectorFor(el: Element) {
            const parts: string[] = [];
            for (let e: Element | null = el, depth = 0; e && e !== document.body && depth < 3; e = e.parentElement, depth++) {
                const label = e.getAttribute("aria-label");
                if (label && label.length < 40 && !/\d{5,}/.test(label)) { parts.unshift(`[aria-label="${label.replace(/"/g, '\\"')}"]`); break; }
                const mod = [...e.classList].map(c => c.match(/^([a-zA-Z][\w-]*?)_[\w-]{4,8}$/)?.[1]).find(Boolean);
                parts.unshift(mod ? `[class*="${mod}_"]` : e.tagName.toLowerCase());
            }
            return parts.join(" > ");
        },
        start() {
            this.onClick = async (e: MouseEvent) => {
                if (!(e.ctrlKey && e.altKey && e.shiftKey)) return;
                e.preventDefault(); e.stopImmediatePropagation();
                const sel = this.selectorFor(e.target as Element);
                await copyText(sel);
                ui.toast("Copied: " + sel, { type: "ok", ms: 6000 });
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),
    definePlugin({
        name: "DimWhenUnfocused",
        description: "Dims Discord when it's not the active window.",
        authors: ["Obsid"], category: "Appearance",
        options: { amount: { type: "number", default: 30, label: "Dim amount (%)" } },
        start() {
            this.style = managedStyle("obsid-dim-unfocused");
            const update = () => {
                const a = Math.max(0, Math.min(90, Number(this.settings.amount) || 0)) / 100;
                this.style.set(`html.obsid-unfocused #app-mount { filter: brightness(${1 - a}); transition: filter .25s; } #app-mount { transition: filter .25s; }`);
            };
            this.update = update;
            update();
            this.onBlur = () => document.documentElement.classList.add("obsid-unfocused");
            this.onFocus = () => document.documentElement.classList.remove("obsid-unfocused");
            window.addEventListener("blur", this.onBlur);
            window.addEventListener("focus", this.onFocus);
        },
        onSettingChange() { if (this.started) this.update?.(); },
        stop() {
            window.removeEventListener("blur", this.onBlur);
            window.removeEventListener("focus", this.onFocus);
            document.documentElement.classList.remove("obsid-unfocused");
            this.style?.remove();
        },
    }),
];

void h;
