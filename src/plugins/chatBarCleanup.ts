import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "ChatBarCleanup",
    description: "Hides chat bar buttons you never use: gift, GIF, stickers, apps and more.",
    authors: ["Vanta"],
    category: "Appearance",
    options: {
        gift: { type: "boolean", default: true, label: "Hide gift button" },
        gif: { type: "boolean", default: false, label: "Hide GIF button" },
        stickers: { type: "boolean", default: true, label: "Hide sticker button" },
        apps: { type: "boolean", default: true, label: "Hide apps button" },
        emoji: { type: "boolean", default: false, label: "Hide emoji button" },
        translate: { type: "boolean", default: false, label: "Hide translate button" },
    },
    LABELS: {
        gift: ["Send a gift"],
        gif: ["Open GIF picker"],
        stickers: ["Open sticker picker"],
        apps: ["Apps"],
        emoji: ["Add Emoji", "Select emoji"],
        translate: ["Open Translate Modal"],
    },

    css() {
        const labels = Object.entries(this.LABELS).filter(([k]) => this.settings[k]).flatMap(([, l]) => l);
        if (!labels.length) return "";
        // Chat bar buttons are <div role="button">; hide the wrapper around each so no gap is left.
        const btn = labels.map(l => `[aria-label="${l}"]`).join(", ");
        return `[class*="buttons_"] > :has(:is(${btn})), [class*="buttons_"] :is(${btn}) { display: none !important; }`;
    },
    update() {
        this.style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "vanta-chatbar-cleanup" }));
        this.style.textContent = this.css();
    },
    onSettingChange() { if (this.started) this.update(); },
    start() { onDomReady(() => this.update()); },
    stop() { this.style?.remove(); this.style = null; },
});
