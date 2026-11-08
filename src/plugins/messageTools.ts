// Click/keyboard shortcuts on messages. One capture listener per plugin, no polling.
import { definePlugin, ui, h, common, messageFromElement, messageIdsFromElement, messageLink, copyText } from "@api";

const isMessageClick = (e: MouseEvent) => !!(e.target as Element).closest?.('[id^="chat-messages-"]');
/** Don't hijack clicks on links, buttons, images or inputs inside the message. */
const onInteractive = (e: MouseEvent) => !!(e.target as Element).closest?.("a, button, [role=button], img, video, input, textarea, [contenteditable=true]");

export default [
    definePlugin({
        name: "CopyIds",
        description: "Ctrl+Shift+click a message to copy its ID. Add Alt to copy the author's user ID instead.",
        authors: ["Vanta"], category: "Utility",
        start() {
            this.onClick = async (e: MouseEvent) => {
                if (!(e.ctrlKey && e.shiftKey) || e.button !== 0 || !isMessageClick(e)) return;
                const ids = messageIdsFromElement(e.target as Element);
                if (!ids) return;
                e.preventDefault(); e.stopImmediatePropagation();
                if (e.altKey) {
                    const author = messageFromElement(e.target as Element)?.author;
                    if (!author) return ui.toast("Couldn't find that message's author.", { type: "danger" });
                    await copyText(author.id);
                    ui.toast(`Copied ${author.username}'s user ID`, { type: "ok" });
                } else {
                    await copyText(ids.messageId);
                    ui.toast("Copied message ID", { type: "ok" });
                }
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),
    definePlugin({
        name: "CopyMessageLink",
        description: "Ctrl+Alt+click a message to copy a link to it.",
        authors: ["Vanta"], category: "Utility",
        start() {
            this.onClick = async (e: MouseEvent) => {
                if (!(e.ctrlKey && e.altKey) || e.shiftKey || e.button !== 0 || !isMessageClick(e)) return;
                const ids = messageIdsFromElement(e.target as Element);
                if (!ids) return;
                e.preventDefault(); e.stopImmediatePropagation();
                await copyText(messageLink(ids.channelId, ids.messageId));
                ui.toast("Copied message link", { type: "ok" });
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),
    definePlugin({
        name: "ViewRaw",
        description: "Ctrl+middle-click a message to see its raw text (with markdown) and copy it.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        start() {
            this.onAux = (e: MouseEvent) => {
                if (e.button !== 1 || !e.ctrlKey || !isMessageClick(e)) return;
                const msg = messageFromElement(e.target as Element);
                if (!msg) return;
                e.preventDefault(); e.stopImmediatePropagation();
                const raw = String(msg.content ?? "");
                const json = JSON.stringify({
                    id: msg.id, channel_id: msg.channel_id, author: { id: msg.author?.id, username: msg.author?.username },
                    timestamp: String(msg.timestamp), edited: msg.editedTimestamp ? String(msg.editedTimestamp) : null,
                    attachments: (msg.attachments || []).map((a: any) => a.url), embeds: (msg.embeds || []).length, flags: msg.flags,
                }, null, 2);
                const pre = (text: string) => h("pre", { class: "vanta-code", style: { margin: 0, padding: "12px", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "240px", overflow: "auto", background: "var(--o-input)", borderRadius: "8px" } }, text);
                ui.modal({
                    title: `Message from ${msg.author?.username ?? "unknown"}`,
                    body: [h("div", { class: "vanta-row-title" }, "Content"), pre(raw || "(empty)"), h("div", { class: "vanta-row-title" }, "Details"), pre(json)],
                    buttons: [
                        { text: "Copy content", variant: "ghost", onClick: async () => { await copyText(raw); ui.toast("Copied", { type: "ok" }); return false; } },
                        { text: "Close", variant: "primary" },
                    ],
                });
            };
            document.addEventListener("auxclick", this.onAux, true);
            this.onDown = (e: MouseEvent) => { if (e.button === 1 && e.ctrlKey && isMessageClick(e)) e.preventDefault(); }; // no autoscroll
            document.addEventListener("mousedown", this.onDown, true);
        },
        stop() {
            document.removeEventListener("auxclick", this.onAux, true);
            document.removeEventListener("mousedown", this.onDown, true);
        },
    }),
    definePlugin({
        name: "DoubleClickActions",
        description: "Double-click a message to reply to it, or double-click your own message to edit it.",
        authors: ["Vanta"], category: "Chat",
        needsWebpack: true,
        options: {
            edit: { type: "boolean", default: true, label: "Double-click my messages to edit" },
            reply: { type: "boolean", default: true, label: "Double-click others' messages to reply" },
        },
        start() {
            this.onDbl = (e: MouseEvent) => {
                if (!isMessageClick(e) || onInteractive(e) || e.ctrlKey || e.shiftKey || e.altKey) return;
                const li = (e.target as Element).closest('[id^="chat-messages-"]')!;
                const msg = messageFromElement(li);
                const mine = msg?.author?.id && msg.author.id === common.UserStore?.getCurrentUser?.()?.id;
                const label = mine && this.settings.edit ? "Edit" : !mine && this.settings.reply ? "Reply" : null;
                const btn = label && li.querySelector<HTMLElement>(`[aria-label="Message Actions"] [aria-label="${label}"], [aria-label="${label}"]`);
                if (!btn) return;
                window.getSelection()?.removeAllRanges(); // double-click selects a word; undo that
                btn.click();
            };
            document.addEventListener("dblclick", this.onDbl, true);
        },
        stop() { document.removeEventListener("dblclick", this.onDbl, true); },
    }),
];
