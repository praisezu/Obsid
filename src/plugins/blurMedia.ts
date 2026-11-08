import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "BlurMedia",
    description: "Blurs images and videos in chat until you hover over them. Handy when sharing your screen.",
    authors: ["Obsid"],
    category: "Privacy",
    options: {
        amount: { type: "number", default: 20, label: "Blur strength", description: "In pixels. Higher is blurrier." },
        hover: { type: "boolean", default: true, label: "Unblur on hover" },
        avatars: { type: "boolean", default: false, label: "Blur avatars too" },
    },

    css() {
        const px = Math.max(1, Math.min(80, Number(this.settings.amount) || 20));
        const media = `[id^="message-accessories-"] :is([class*="imageWrapper_"], video, [class*="embedVideo_"], [class*="embedImage_"], [class*="embedThumbnail_"])`;
        const targets = this.settings.avatars ? `${media}, img[class*="avatar_"]` : media;
        let css = `${targets} { filter: blur(${px}px); transition: filter .2s ease; }`;
        if (this.settings.hover) css += `\n:is(${targets}):hover { filter: none; }`;
        return css;
    },
    update() {
        this.style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "obsid-blur-media" }));
        this.style.textContent = this.css();
    },
    onSettingChange() { if (this.started) this.update(); },
    start() { onDomReady(() => this.update()); },
    stop() { this.style?.remove(); this.style = null; },
});
