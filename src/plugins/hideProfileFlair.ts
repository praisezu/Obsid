import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "HideProfileFlair",
    description: "Hides avatar decorations, server tags and profile effects for a cleaner chat.",
    authors: ["Obsid"],
    category: "Appearance",
    options: {
        decorations: { type: "boolean", default: true, label: "Hide avatar decorations" },
        tags: { type: "boolean", default: false, label: "Hide server tags", description: "The small tag badges next to names." },
        effects: { type: "boolean", default: true, label: "Hide profile effects", description: "Animated overlays on profile cards." },
    },

    css() {
        const rules: string[] = [];
        // "avatarDecoration_" (with the underscore) is the decoration itself, not its container.
        if (this.settings.decorations) rules.push(`[class*="avatarDecoration_"] { display: none !important; }`);
        if (this.settings.tags) rules.push(`[class*="clanTag_"], [class*="clanTagChiplet_"] { display: none !important; }`);
        if (this.settings.effects) rules.push(`[class*="profileEffects_"] { display: none !important; }`);
        return rules.join("\n");
    },
    update() {
        this.style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "obsid-hide-flair" }));
        this.style.textContent = this.css();
    },
    onSettingChange() { if (this.started) this.update(); },
    start() { onDomReady(() => this.update()); },
    stop() { this.style?.remove(); this.style = null; },
});
