import { definePlugin, cssPlugin, common, watchElements, messageFromElement } from "@api";

const MESSAGE = '[id^="chat-messages-"]';
const each = (fn: (li: HTMLElement) => void) => document.querySelectorAll<HTMLElement>(MESSAGE).forEach(fn);

/** Normal chat messages: default, reply, slash command, context-menu command. Everything else is a system message. */
const USER_TYPES = new Set([0, 19, 20, 23]);

/** A plugin that toggles a class on messages matching `test`. */
function messageClassPlugin(def: { name: string; description: string; category: string; cls: string; css: string; test: (msg: any) => boolean }) {
    return definePlugin({
        name: def.name, description: def.description, category: def.category, authors: ["Obsid"],
        needsWebpack: true,
        start() {
            this.style = document.head.appendChild(Object.assign(document.createElement("style"), { id: "obsid-" + def.cls, textContent: def.css }));
            this.unwatch = watchElements(MESSAGE, li => {
                const msg = messageFromElement(li);
                if (msg && def.test(msg)) li.classList.add(def.cls);
            });
        },
        stop() { this.unwatch?.(); this.style?.remove(); each(li => li.classList.remove(def.cls)); },
    });
}

export default [
    messageClassPlugin({
        name: "HighlightMyMessages",
        description: "Gives your own messages a subtle tint so they're easy to spot in busy chats.",
        category: "Appearance",
        cls: "obsid-mine",
        css: `.obsid-mine { background: color-mix(in srgb, #8b5cf6 6%, transparent); box-shadow: inset 2px 0 0 color-mix(in srgb, #8b5cf6 60%, transparent); }`,
        test: msg => msg.author?.id === common.UserStore?.getCurrentUser?.()?.id,
    }),
    messageClassPlugin({
        name: "HideBotMessages",
        description: "Hides messages from bots (and webhooks). Turn off to see them again.",
        category: "Chat",
        cls: "obsid-bot-msg",
        css: `.obsid-bot-msg { display: none !important; }`,
        test: msg => !!msg.author?.bot,
    }),
    messageClassPlugin({
        name: "HideSystemMessages",
        description: "Hides join messages, boosts, pins and other system messages.",
        category: "Chat",
        cls: "obsid-system-msg",
        css: `.obsid-system-msg { display: none !important; }`,
        test: msg => typeof msg.type === "number" && !USER_TYPES.has(msg.type),
    }),
    cssPlugin({
        name: "TransparentWindow",
        description: "See-through Discord with Windows 11 blur (acrylic or mica). Works best with a theme. May affect window snapping.",
        authors: ["Obsid"], category: "Appearance",
        restartNeeded: true,
        options: {
            material: {
                type: "select", default: "acrylic", label: "Background effect (needs restart)",
                options: [{ value: "acrylic", label: "Acrylic (blurred)" }, { value: "mica", label: "Mica (subtle)" }, { value: "none", label: "None (fully see-through)" }],
            },
            opacity: { type: "number", default: 70, label: "Panel opacity (%)", description: "How solid Discord's backgrounds are. Applies right away." },
        },
        css: s => {
            const a = Math.max(10, Math.min(100, Number(s.opacity) || 70)) / 100;
            const mix = (v: string, fb: string) => `color-mix(in srgb, var(${v}-obsid, ${fb}) ${a * 100}%, transparent)`;
            return `html, body, #app-mount, [class*="appMount_"], [class*="bg_"] { background: transparent !important; }
:root, .theme-dark, .theme-darker, .theme-midnight, .theme-light, .visual-refresh {
  --background-base-lowest: ${mix("--bbl", "#0b0b0e")} !important; --background-base-lower: ${mix("--bblr", "#121214")} !important;
  --background-base-low: ${mix("--bbl2", "#1a1a1e")} !important; --background-surface-high: ${mix("--bsh", "#202024")} !important;
  --background-surface-higher: ${mix("--bshr", "#26262b")} !important; --chat-background-default: ${mix("--cbd", "#1a1a1e")} !important; }`;
        },
    }),
];
