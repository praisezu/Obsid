// See deleted and edited messages. Deleted messages stay in chat (marked red) instead of vanishing,
// edits show the earlier versions underneath, and everything is also kept in a log.
// Works by looking at Discord's message events before they're applied.
import { definePlugin, common, ui, h, patcher, watchElements, managedStyle, messageIdsFromElement } from "@api";

const EPHEMERAL = 1 << 6;

const CSS = `
.obsid-deleted { background: color-mix(in srgb, var(--status-danger, #e5484d) 9%, transparent) !important; }
.obsid-deleted [id^="message-content-"], .obsid-deleted [id^="message-accessories-"] { opacity: .85; }
.obsid-deleted [id^="message-content-"] { color: color-mix(in srgb, var(--status-danger, #e5484d) 75%, var(--text-default)) !important; }
.obsid-deleted-tag { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 4px; font-size: 11px; font-weight: 700; line-height: 16px;
  vertical-align: middle; color: var(--status-danger, #e5484d); background: color-mix(in srgb, var(--status-danger, #e5484d) 15%, transparent); }
.obsid-edit-history { margin: 2px 0 4px; display: flex; flex-direction: column; gap: 2px; }
.obsid-edit-history div { font-size: .9em; color: var(--text-muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--text-muted) 60%, transparent);
  white-space: pre-wrap; overflow-wrap: anywhere; }
.obsid-edit-history div::before { content: "edited from: "; text-decoration: none; display: inline-block; font-size: .85em; font-weight: 600; margin-right: 4px; opacity: .8; }`;

export default definePlugin({
    name: "MessageLogger",
    description: "See deleted and edited messages. Deleted ones stay in chat marked red, edits show what they said before, and everything goes into a log.",
    authors: ["Obsid"],
    category: "Chat",
    needsWebpack: true,
    options: {
        keepDeleted: { type: "boolean", default: true, label: "Keep deleted messages in chat", description: "Marked in red. They disappear when you reload Discord." },
        showEdits: { type: "boolean", default: true, label: "Show edit history under messages" },
        ignoreSelf: { type: "boolean", default: true, label: "Ignore my own messages", description: "Your own deletes always go through normally either way." },
        ignoreBots: { type: "boolean", default: false, label: "Ignore bots" },
        toast: { type: "boolean", default: false, label: "Notify on delete", description: "Show a small notification when a message is deleted." },
        max: { type: "number", default: 300, label: "Max log entries" },
    },

    log: [] as any[],
    deleted: new Set<string>(),
    edits: new Map<string, string[]>(),

    describe(msg: any) {
        const { ChannelStore, GuildStore } = common;
        const ch = ChannelStore?.getChannel?.(msg.channel_id);
        const guild = ch?.guild_id ? GuildStore?.getGuild?.(ch.guild_id) : null;
        const where = ch ? (guild ? `#${ch.name} · ${guild.name}` : ch.name ? ch.name : "DM") : "Unknown channel";
        return {
            author: msg.author?.globalName || msg.author?.global_name || msg.author?.username || "Unknown",
            where,
            attachments: (msg.attachments || []).map((a: any) => a.url || a.proxy_url).filter(Boolean),
        };
    },
    isMine: (msg: any) => !!msg?.author?.id && msg.author.id === common.UserStore?.getCurrentUser?.()?.id,
    skip(msg: any) {
        if (!msg) return true;
        if (this.settings.ignoreSelf && this.isMine(msg)) return true;
        if (this.settings.ignoreBots && msg.author?.bot) return true;
        return false;
    },
    add(entry: any) {
        this.log.unshift({ ...entry, at: new Date().toLocaleTimeString() });
        const max = Math.max(10, Number(this.settings.max) || 300);
        if (this.log.length > max) this.log.length = max;
    },

    /** Should this delete be kept on screen instead of applied? */
    keep(msg: any) {
        return this.settings.keepDeleted && msg && !this.isMine(msg) && !(msg.flags & EPHEMERAL) && !this.skip(msg);
    },
    onDelete(channelId: string, id: string) {
        const msg = common.MessageStore.getMessage(channelId, id);
        if (msg && !this.skip(msg) && (msg.content || msg.attachments?.length)) {
            this.add({ kind: "deleted", content: msg.content, ...this.describe(msg) });
            if (this.settings.toast) ui.toast(`${this.describe(msg).author} deleted: ${(msg.content || "[attachment]").slice(0, 80)}`);
        }
        if (!this.keep(msg)) return false;
        this.deleted.add(id);
        this.decorate(document.getElementById(`chat-messages-${channelId}-${id}`));
        return true;
    },

    /** Adds the deleted marker / edit history to a rendered message. */
    decorate(li: HTMLElement | null) {
        const ids = li && messageIdsFromElement(li);
        if (!li || !ids) return;
        if (this.deleted.has(ids.messageId)) {
            li.classList.add("obsid-deleted");
            const header = li.querySelector('[id^="message-timestamp-"]')?.parentElement;
            if (header && !header.querySelector(".obsid-deleted-tag"))
                header.append(Object.assign(document.createElement("span"), { className: "obsid-deleted-tag", textContent: "deleted" }));
        }
        const history = this.settings.showEdits && this.edits.get(ids.messageId);
        const content = li.querySelector('[id^="message-content-"]');
        if (history?.length && content) {
            let box = li.querySelector<HTMLElement>(".obsid-edit-history");
            if (!box) { box = document.createElement("div"); box.className = "obsid-edit-history"; }
            if (box.previousElementSibling !== content) content.before(box);
            box.replaceChildren(...history.map(t => Object.assign(document.createElement("div"), { textContent: t || "(empty)" })));
        }
    },

    start() {
        const { FluxDispatcher, MessageStore } = common;
        if (!FluxDispatcher || !MessageStore) throw new Error("Couldn't find Discord's message modules");
        this.style = managedStyle("obsid-message-logger");
        this.style.set(CSS);

        this.unpatch = patcher.instead(FluxDispatcher, "dispatch", (args: any[], original: (...a: any[]) => any) => {
            const action = args[0];
            try {
                if (action?.type === "MESSAGE_DELETE" && !action.mlDeleted) {
                    if (this.onDelete(action.channelId, action.id)) return Promise.resolve();
                } else if (action?.type === "MESSAGE_DELETE_BULK" && Array.isArray(action.ids)) {
                    const pass = action.ids.filter((id: string) => !this.onDelete(action.channelId, id));
                    if (pass.length !== action.ids.length) {
                        if (!pass.length) return Promise.resolve();
                        return original({ ...action, ids: pass });
                    }
                } else if (action?.type === "MESSAGE_UPDATE") {
                    const next = action.message;
                    const msg = next?.id && MessageStore.getMessage(next.channel_id, next.id);
                    if (msg && typeof next.content === "string" && msg.content !== next.content && !this.skip(msg)) {
                        this.add({ kind: "edited", content: msg.content, after: next.content, ...this.describe(msg) });
                        const list = this.edits.get(next.id) ?? [];
                        list.push(msg.content);
                        this.edits.set(next.id, list.slice(-10));
                        const result = original(...args);
                        // Discord re-renders the message; add the history after it does.
                        setTimeout(() => this.decorate(document.getElementById(`chat-messages-${next.channel_id}-${next.id}`)), 50);
                        return result;
                    }
                }
            } catch (e) { this.logger.error(e); }
            return original(...args);
        });
        this.unwatch = watchElements('[id^="chat-messages-"]', li => {
            const ids = messageIdsFromElement(li);
            if (ids && (this.deleted.has(ids.messageId) || this.edits.has(ids.messageId))) this.decorate(li);
        });
    },
    stop() {
        this.unpatch?.();
        this.unwatch?.();
        this.style?.remove();
        document.querySelectorAll(".obsid-deleted").forEach(el => el.classList.remove("obsid-deleted"));
        document.querySelectorAll(".obsid-deleted-tag, .obsid-edit-history").forEach(el => el.remove());
    },

    settingsPanel() {
        const list = h("div", { class: "obsid-list", style: { maxHeight: "360px", overflow: "auto" } });
        const render = () => {
            list.replaceChildren(...(this.log.length ? this.log.map((e: any) => ui.card({ class: "obsid-pad", style: { display: "flex", flexDirection: "column", gap: "4px" } },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
                    ui.tag(e.kind === "deleted" ? "Deleted" : "Edited", e.kind === "deleted" ? "danger" : "warn"),
                    h("b", {}, e.author),
                    h("span", { class: "obsid-row-desc", style: { margin: 0 } }, `${e.where} · ${e.at}`)),
                h("div", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", textDecoration: e.kind === "edited" ? "line-through" : "none", opacity: e.kind === "edited" ? .7 : 1 } }, e.content || "(no text)"),
                e.after != null ? h("div", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, e.after) : null,
                e.attachments?.length ? h("div", { class: "obsid-row-desc obsid-code", style: { overflowWrap: "anywhere" } }, e.attachments.join("\n")) : null,
            )) : [ui.empty(this.started ? "Nothing logged yet. Deleted and edited messages will show up here." : "Turn MessageLogger on to start logging.", "info")]));
        };
        render();
        return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                h("div", { class: "obsid-row-title", style: { flex: "1" } }, `Log (${this.log.length})`),
                ui.button("Clear", { small: true, variant: "ghost", icon: "trash", onClick: () => { this.log.length = 0; render(); } })),
            list,
            h("div", { class: "obsid-row-desc" }, "The log lives in memory only and is cleared when Discord restarts."));
    },
});
