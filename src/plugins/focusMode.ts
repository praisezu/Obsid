import { definePlugin, ui, onDomReady } from "@api";

export default definePlugin({
    name: "FocusMode",
    description: "Press Ctrl+Alt+F to hide the server list, channel list and member list, leaving just the chat.",
    authors: ["Obsid"],
    category: "Appearance",
    options: {
        servers: { type: "boolean", default: true, label: "Hide server list" },
        channels: { type: "boolean", default: true, label: "Hide channel list" },
        members: { type: "boolean", default: true, label: "Hide member list" },
    },

    /** Discord's layout classes share a hash with the server list's class, so derive them at runtime. */
    css() {
        const nav = document.querySelector('nav[aria-label="Servers sidebar"]');
        const guildsCls = nav && [...nav.classList].find(c => c.startsWith("guilds_"));
        const hash = guildsCls?.slice("guilds_".length);
        const rules: string[] = [];
        if (this.settings.servers) rules.push(`nav[aria-label="Servers sidebar"]`);
        if (this.settings.channels && hash) rules.push(`.sidebar_${CSS.escape(hash)}`);
        if (this.settings.members) rules.push(`aside[class*="membersWrap_"]`);
        return rules.length ? `html.obsid-focus :is(${rules.join(", ")}) { display: none !important; }` : "";
    },
    toggle(force?: boolean) {
        const on = document.documentElement.classList.toggle("obsid-focus", force);
        if (on) this.update();
        if (force === undefined) ui.toast(on ? "Focus mode on (Ctrl+Alt+F to exit)" : "Focus mode off");
    },
    update() {
        this.style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "obsid-focus-mode" }));
        this.style.textContent = this.css();
    },
    onSettingChange() { if (this.started) this.update(); },
    start() {
        this.onKey = e => {
            if (e.ctrlKey && e.altKey && !e.shiftKey && e.code === "KeyF") { e.preventDefault(); e.stopPropagation(); this.toggle(); }
        };
        document.addEventListener("keydown", this.onKey, true);
        onDomReady(() => this.update());
    },
    stop() {
        document.removeEventListener("keydown", this.onKey, true);
        this.toggle(false);
        this.style?.remove();
        this.style = null;
    },
});
