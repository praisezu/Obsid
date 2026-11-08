import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "HideUpsells",
    description: "Removes Nitro, Shop and Quests links from your DM list, plus the gift button.",
    authors: ["Obsid"],
    category: "Appearance",
    options: {
        nitro: { type: "boolean", default: true, label: "Hide Nitro link" },
        shop: { type: "boolean", default: true, label: "Hide Shop link" },
        quests: { type: "boolean", default: true, label: "Hide Quests link" },
        gift: { type: "boolean", default: true, label: "Hide gift button" },
    },

    css() {
        const hrefs: string[] = [];
        if (this.settings.nitro) hrefs.push("/store");
        if (this.settings.shop) hrefs.push("/shop");
        if (this.settings.quests) hrefs.push("/quest-home", "/quests");
        const rules: string[] = [];
        if (hrefs.length) {
            const a = hrefs.map(h => `a[href="${h}"]`).join(", ");
            // The link lives inside a list item; hide the whole row.
            rules.push(`li:has(:is(${a})), [role="listitem"]:has(:is(${a})), :is(${a}) { display: none !important; }`);
        }
        if (this.settings.gift)
            rules.push(`[class*="buttons_"] > :has([aria-label="Send a gift"]), [class*="buttons_"] [aria-label="Send a gift"] { display: none !important; }`);
        return rules.join("\n");
    },
    update() {
        this.style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "obsid-hide-upsells" }));
        this.style.textContent = this.css();
    },
    onSettingChange() { if (this.started) this.update(); },
    start() { onDomReady(() => this.update()); },
    stop() { this.style?.remove(); this.style = null; },
});
