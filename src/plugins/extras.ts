import { definePlugin, cssPlugin, ui, copyText } from "@api";

export default [
    cssPlugin({
        name: "BlurNames",
        description: "Streamer-safe: blurs names and previews in your DM list and member list until you hover them.",
        authors: ["Vanta"], category: "Privacy",
        options: { strength: { type: "number", default: 6, label: "Blur (px)" } },
        css: s => {
            const px = Math.max(2, Math.min(20, Number(s.strength) || 6));
            return `:is([class*="privateChannels_"], [class*="members_"]) :is([class*="name_"], [class*="subText_"], [class*="activityStatusText_"]) { filter: blur(${px}px); transition: filter .15s; }
:is([class*="privateChannels_"], [class*="members_"]) [class*="listItem_"]:hover :is([class*="name_"], [class*="subText_"], [class*="activityStatusText_"]),
:is([class*="privateChannels_"], [class*="members_"]) [class*="member_"]:hover :is([class*="name_"], [class*="subText_"], [class*="activityStatusText_"]) { filter: none; }`;
        },
    }),
    cssPlugin({
        name: "ReadableWidth",
        description: "Keeps chat lines from stretching across ultrawide screens.",
        authors: ["Vanta"], category: "Appearance",
        options: { width: { type: "number", default: 1000, label: "Max width (px)" } },
        css: s => `[class*="messagesWrapper_"] [class*="scrollerInner_"] { max-width: ${Math.max(500, Number(s.width) || 1000)}px; margin: 0 auto; width: 100%; }`,
    }),
    cssPlugin({
        name: "HideBadgeCounts",
        description: "Hides red mention/unread number badges on servers and DMs (the unread dot stays).",
        authors: ["Vanta"], category: "Appearance",
        css: `nav[aria-label="Servers sidebar"] [class*="numberBadge_"], nav[aria-label="Servers sidebar"] [class*="lowerBadge_"] { display: none !important; }`,
    }),
    cssPlugin({
        name: "HideAttachButton",
        description: "Hides the + (upload) button in the message box. Drag-and-drop and paste still work.",
        authors: ["Vanta"], category: "Appearance",
        css: `form [class*="attachWrapper_"] { display: none !important; }`,
    }),
    definePlugin({
        name: "ServerHotkeys",
        description: "Alt+1 … Alt+9 jumps to your first nine servers (in sidebar order).",
        authors: ["Vanta"], category: "Utility",
        start() {
            this.onKey = (e: KeyboardEvent) => {
                if (!e.altKey || e.ctrlKey || e.shiftKey || !/^Digit[1-9]$/.test(e.code)) return;
                const n = Number(e.code.slice(5)) - 1;
                const guilds = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Servers sidebar"] [data-list-item-id^="guildsnav___"]')]
                    .filter(el => /^guildsnav___\d+$/.test(el.dataset.listItemId || ""));
                const target = guilds[n];
                if (!target) return;
                e.preventDefault(); e.stopImmediatePropagation();
                target.click();
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),
    definePlugin({
        name: "CopyInlineCode",
        description: "Click `inline code` in a message to copy it.",
        authors: ["Vanta"], category: "Utility",
        start() {
            this.onClick = async (e: MouseEvent) => {
                const code = (e.target as Element).closest?.('[id^="message-content-"] code') as HTMLElement | null;
                if (!code || code.closest("pre") || e.button !== 0 || window.getSelection()?.toString()) return;
                await copyText(code.innerText);
                ui.toast("Copied code", { type: "ok", ms: 1500 });
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),
];
