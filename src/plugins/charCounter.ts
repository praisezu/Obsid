import { definePlugin, common } from "@api";

export default definePlugin({
    name: "CharacterCounter",
    description: "Shows how many characters you've typed and the limit (2000, or 4000 with Nitro) above the message box.",
    authors: ["Vanta"],
    category: "Chat",
    options: {
        onlyNearLimit: { type: "boolean", default: false, label: "Only show near the limit", description: "Appear once you've used 80% of the limit." },
    },

    limit() {
        const me = common.UserStore?.getCurrentUser?.();
        return me?.premiumType > 0 ? 4000 : 2000;
    },
    update() {
        const box = document.querySelector('[role="textbox"][data-slate-editor="true"]');
        const form = box?.closest("form") || box?.closest('[class*="channelTextArea_"]');
        if (!box || !form) { this.el?.remove(); return; }
        // Slate renders placeholders as non-content; use the editor's text only.
        const len = [...box.querySelectorAll('[data-slate-string="true"]')].reduce((n, s) => n + s.textContent.length, 0);
        const limit = this.limit();
        const show = len > 0 && (!this.settings.onlyNearLimit || len >= limit * 0.8);
        if (!this.el) {
            this.el = document.createElement("div");
            this.el.className = "vanta-char-counter";
            this.el.setAttribute("aria-live", "polite");
            Object.assign(this.el.style, {
                position: "absolute", right: "14px", top: "-22px", zIndex: "1", pointerEvents: "none",
                font: "600 12px var(--font-primary, sans-serif)", padding: "2px 6px", borderRadius: "4px",
                background: "var(--background-base-low, #1f1f24)",
            });
        }
        if (this.el.parentElement !== form) {
            if (getComputedStyle(form).position === "static") form.style.position = "relative";
            form.append(this.el);
        }
        this.el.style.display = show ? "" : "none";
        this.el.textContent = `${len} / ${limit}`;
        this.el.style.color = len > limit ? "var(--status-danger, #e5484d)" : len >= limit * 0.9 ? "var(--status-warning, #f0b232)" : "var(--text-muted, #999)";
    },

    start() {
        this.onInput = () => requestAnimationFrame(() => this.update());
        for (const t of ["input", "keyup", "paste", "cut"]) document.addEventListener(t, this.onInput, true);
        this.timer = setInterval(() => this.update(), 1000); // catches channel switches / sends
    },
    stop() {
        for (const t of ["input", "keyup", "paste", "cut"]) document.removeEventListener(t, this.onInput, true);
        clearInterval(this.timer);
        this.el?.remove();
        this.el = null;
    },
});
