import { definePlugin, native } from "@api";

export default definePlugin({
    name: "ViewFullImages",
    description: "Ctrl+click any avatar, server icon, emoji, banner or image to open it at full size in your browser.",
    authors: ["Vanta"],
    category: "Utility",
    options: {
        modifier: {
            type: "select", default: "ctrl", label: "Hold this key while clicking",
            options: [{ value: "ctrl", label: "Ctrl" }, { value: "alt", label: "Alt" }, { value: "shift", label: "Shift" }],
        },
    },

    /** Best full-resolution URL for a Discord CDN image, or null if it isn't one. */
    fullUrl(src) {
        let u;
        try { u = new URL(src, location.href); } catch { return null; }
        if (u.hostname === "media.discordapp.net" && u.pathname.startsWith("/attachments/")) {
            // Proxied attachment preview → the original upload (keep the signed ex/is/hm params)
            const out = new URL("https://cdn.discordapp.com" + u.pathname);
            for (const k of ["ex", "is", "hm"]) if (u.searchParams.has(k)) out.searchParams.set(k, u.searchParams.get(k));
            return out.href;
        }
        if (!/^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(u.hostname)) return null;
        if (!/^\/(avatars|icons|banners|emojis|app-icons|role-icons|guilds|splashes|discovery-splashes|avatar-decoration-presets|clan-badges|stickers)\//.test(u.pathname)) return null;
        const animated = /\/a_[0-9a-f]+\.\w+$/.test(u.pathname) || u.searchParams.get("animated") === "true";
        u.hostname = "cdn.discordapp.com";
        u.search = "";
        if (!u.pathname.startsWith("/stickers/")) u.searchParams.set("size", "4096");
        if (animated) u.pathname = u.pathname.replace(/\.(webp|png|jpg)$/, ".gif");
        else if (/\.webp$/.test(u.pathname)) u.pathname = u.pathname.replace(/\.webp$/, ".png");
        return u.href;
    },

    findImage(target) {
        const img = target.closest?.("img") || target.querySelector?.(":scope > img");
        if (img?.src) return img.src;
        // Avatars are often <svg><foreignObject><img>, or a div with a background image.
        const bg = target.closest?.("[style*='background-image']");
        const m = bg?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
        return m?.[1] || null;
    },

    start() {
        this.onClick = e => {
            const mod = this.settings.modifier;
            const held = mod === "alt" ? e.altKey : mod === "shift" ? e.shiftKey : e.ctrlKey;
            if (!held || e.button !== 0) return;
            const src = this.findImage(e.target);
            const url = src && this.fullUrl(src);
            if (!url) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            native.openUrl(url);
        };
        document.addEventListener("click", this.onClick, true);
    },
    stop() { document.removeEventListener("click", this.onClick, true); },
});
