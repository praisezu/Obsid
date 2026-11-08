import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "CustomFont",
    description: "Use any font installed on your computer for Discord's text and code.",
    authors: ["Vanta"],
    category: "Appearance",
    options: {
        font: { type: "string", default: "", label: "Text font", placeholder: "Inter", description: "Font name as installed, e.g. Inter or Segoe UI. Empty = Discord default." },
        codeFont: { type: "string", default: "", label: "Code font", placeholder: "JetBrains Mono", description: "Used for code blocks. Empty = Discord default." },
        scale: { type: "number", default: 100, label: "Chat text size (%)", description: "Scales message text only. 100 = normal." },
    },

    css() {
        const q = f => `"${String(f).replace(/["\\;{}]/g, "").trim()}"`;
        const vars: string[] = [];
        if (this.settings.font?.trim()) {
            const f = `${q(this.settings.font)}, "gg sans", "Noto Sans", sans-serif`;
            vars.push(`--font-primary: ${f}`, `--font-display: ${f}`, `--font-headline: ${f}`);
        }
        if (this.settings.codeFont?.trim()) vars.push(`--font-code: ${q(this.settings.codeFont)}, "gg mono", Consolas, monospace`);
        let css = vars.length
            ? `:root, .theme-dark, .theme-light, .theme-darker, .theme-midnight { ${vars.map(v => v + " !important").join("; ")}; }`
            : "";
        const scale = Number(this.settings.scale) || 100;
        if (scale !== 100) css += `\n[id^="message-content-"] { font-size: ${(scale / 100).toFixed(2)}em !important; line-height: 1.4; }`;
        return css;
    },
    update() {
        this.style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "vanta-custom-font" }));
        this.style.textContent = this.css();
    },
    onSettingChange() { if (this.started) this.update(); },
    start() { onDomReady(() => this.update()); },
    stop() { this.style?.remove(); this.style = null; },
});
