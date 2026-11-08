// Plugins that change how messages in chat look, using the shared element watcher.
import { definePlugin, watchElements, messageFromElement, managedStyle, escapeRegExp } from "@api";

const MESSAGE = '[id^="chat-messages-"]';
const list = (s: unknown) => String(s || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean);

/** Re-checks every visible message (used when options change). */
const recheck = (fn: (li: HTMLElement) => void) => document.querySelectorAll<HTMLElement>(MESSAGE).forEach(fn);

export default [
    definePlugin({
        name: "IgnoreUsers",
        description: "Hides messages from people you list, without blocking them. Paste user IDs (Ctrl+Shift+Alt+click a message with CopyIds).",
        authors: ["Obsid"], category: "Chat",
        needsWebpack: true,
        options: { ids: { type: "text", default: "", label: "User IDs", placeholder: "one per line or comma-separated" } },
        apply(li: HTMLElement) {
            const ids = list(this.settings.ids);
            const author = messageFromElement(li)?.author?.id;
            li.style.display = author && ids.includes(author) ? "none" : "";
        },
        start() { this.unwatch = watchElements(MESSAGE, li => this.apply(li)); },
        onSettingChange() { if (this.started) recheck(li => this.apply(li)); },
        stop() { this.unwatch?.(); recheck(li => { li.style.display = ""; }); },
    }),
    definePlugin({
        name: "HighlightUsers",
        description: "Gives messages from people you choose a coloured background, so you never miss them.",
        authors: ["Obsid"], category: "Chat",
        needsWebpack: true,
        options: {
            ids: { type: "text", default: "", label: "User IDs", placeholder: "one per line or comma-separated" },
            color: { type: "string", default: "#f0b232", label: "Colour" },
        },
        apply(li: HTMLElement) {
            const author = messageFromElement(li)?.author?.id;
            const on = !!author && list(this.settings.ids).includes(author);
            const c = String(this.settings.color || "#f0b232").replace(/[;{}<>]/g, "");
            li.style.background = on ? `color-mix(in srgb, ${c} 12%, transparent)` : "";
            li.style.boxShadow = on ? `inset 2px 0 0 ${c}` : "";
        },
        start() { this.unwatch = watchElements(MESSAGE, li => this.apply(li)); },
        onSettingChange() { if (this.started) recheck(li => this.apply(li)); },
        stop() { this.unwatch?.(); recheck(li => { li.style.background = ""; li.style.boxShadow = ""; }); },
    }),
    definePlugin({
        name: "HideMessagesWith",
        description: "Hides messages containing words or phrases you never want to see (spoilers, slurs, topics).",
        authors: ["Obsid"], category: "Chat",
        needsWebpack: true,
        options: {
            words: { type: "text", default: "", label: "Words / phrases", placeholder: "one per line" },
            mode: { type: "select", default: "blur", label: "When matched", options: [{ value: "blur", label: "Blur (hover to read)" }, { value: "hide", label: "Hide completely" }] },
        },
        apply(li: HTMLElement) {
            const words = list(this.settings.words);
            const content: string = messageFromElement(li)?.content ?? "";
            const hit = words.length > 0 && new RegExp(words.map(escapeRegExp).join("|"), "i").test(content);
            li.classList.toggle("obsid-filtered", hit && this.settings.mode === "blur");
            li.style.display = hit && this.settings.mode === "hide" ? "none" : "";
        },
        start() {
            this.style = managedStyle("obsid-hide-messages-with");
            this.style.set(`.obsid-filtered [id^="message-content-"], .obsid-filtered [id^="message-accessories-"] { filter: blur(6px); transition: filter .15s; }
.obsid-filtered:hover [id^="message-content-"], .obsid-filtered:hover [id^="message-accessories-"] { filter: none; }`);
            this.unwatch = watchElements(MESSAGE, li => this.apply(li));
        },
        onSettingChange() { if (this.started) recheck(li => this.apply(li)); },
        stop() {
            this.unwatch?.();
            this.style?.remove();
            recheck(li => { li.style.display = ""; li.classList.remove("obsid-filtered"); });
        },
    }),
    definePlugin({
        name: "CollapseLongMessages",
        description: "Folds very long messages with a \"Show more\" button.",
        authors: ["Obsid"], category: "Chat",
        options: { height: { type: "number", default: 300, label: "Collapse above (px)" } },
        start() {
            const max = () => Math.max(120, Number(this.settings.height) || 300);
            this.style = managedStyle("obsid-collapse-long");
            const css = () => this.style.set(`.obsid-collapsed { max-height: ${max()}px; overflow: hidden; -webkit-mask-image: linear-gradient(#000 70%, transparent); }
.obsid-more { all: unset; cursor: pointer; display: block; margin: 4px 0 2px; font-size: 13px; font-weight: 600; color: var(--text-link); }
.obsid-more:hover { text-decoration: underline; }`);
            css();
            this.css = css;
            this.unwatch = watchElements('[id^="message-content-"]', el => {
                requestAnimationFrame(() => {
                    if (el.scrollHeight <= max() + 40 || el.dataset.obsidCollapse) return;
                    el.dataset.obsidCollapse = "1";
                    el.classList.add("obsid-collapsed");
                    const btn = document.createElement("button");
                    btn.className = "obsid-more";
                    btn.type = "button";
                    btn.textContent = "Show more";
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const collapsed = el.classList.toggle("obsid-collapsed");
                        btn.textContent = collapsed ? "Show more" : "Show less";
                    });
                    el.after(btn);
                });
            });
        },
        onSettingChange() { if (this.started) this.css?.(); },
        stop() {
            this.unwatch?.();
            this.style?.remove();
            document.querySelectorAll(".obsid-more").forEach(b => b.remove());
            document.querySelectorAll<HTMLElement>("[data-obsid-collapse]").forEach(el => { el.classList.remove("obsid-collapsed"); delete el.dataset.obsidCollapse; });
        },
    }),
    definePlugin({
        name: "VideoTweaks",
        description: "Sets a default volume for videos in chat (no more full-blast clips), and can loop them.",
        authors: ["Obsid"], category: "Utility",
        options: {
            volume: { type: "number", default: 40, label: "Default volume (%)" },
            loop: { type: "boolean", default: false, label: "Loop videos" },
        },
        start() {
            this.unwatch = watchElements('[id^="message-accessories-"] video', v => {
                const video = v as unknown as HTMLVideoElement;
                video.volume = Math.max(0, Math.min(100, Number(this.settings.volume) || 0)) / 100;
                video.loop = !!this.settings.loop;
            });
        },
        stop() { this.unwatch?.(); },
    }),
    definePlugin({
        name: "PictureInPicture",
        description: "Adds a picture-in-picture button to videos in chat so you can keep watching while you scroll.",
        authors: ["Obsid"], category: "Utility",
        start() {
            this.style = managedStyle("obsid-pip");
            this.style.set(`.obsid-pip-wrap { position: relative; }
.obsid-pip { all: unset; position: absolute; top: 8px; left: 8px; z-index: 3; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  background: rgba(0,0,0,.65); color: #fff; font: 600 12px var(--font-primary, sans-serif); opacity: 0; transition: opacity .15s; }
.obsid-pip-wrap:hover .obsid-pip, .obsid-pip:focus-visible { opacity: 1; }`);
            this.unwatch = watchElements('[id^="message-accessories-"] video', v => {
                const video = v as unknown as HTMLVideoElement;
                const wrap = video.parentElement;
                if (!wrap || wrap.querySelector(".obsid-pip") || !document.pictureInPictureEnabled) return;
                wrap.classList.add("obsid-pip-wrap");
                const btn = document.createElement("button");
                btn.className = "obsid-pip";
                btn.type = "button";
                btn.textContent = "PiP";
                btn.title = "Picture in picture";
                btn.addEventListener("click", async e => {
                    e.stopPropagation(); e.preventDefault();
                    try { if (document.pictureInPictureElement === video) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); }
                    catch (err) { console.warn("[Obsid:PictureInPicture]", err); }
                });
                wrap.append(btn);
            });
        },
        stop() {
            this.unwatch?.();
            this.style?.remove();
            document.querySelectorAll(".obsid-pip").forEach(b => b.remove());
        },
    }),
];
