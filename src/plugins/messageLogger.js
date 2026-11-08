// Watches Discord's internal message events. Before a delete/edit is applied we grab the
// original from the message store, so you can still read it afterwards.
Obsid.definePlugin({
    name: "MessageLogger",
    description: "Keeps a log of messages people delete or edit, so you can still read them. Open its settings to view the log.",
    authors: ["Obsid"],
    category: "Chat",
    needsWebpack: true,
    options: {
        edits: { type: "boolean", default: true, label: "Log edits", description: "Also keep the text from before an edit." },
        ignoreSelf: { type: "boolean", default: true, label: "Ignore my own messages" },
        ignoreBots: { type: "boolean", default: true, label: "Ignore bots" },
        toast: { type: "boolean", default: false, label: "Notify on delete", description: "Show a small notification when a message is deleted." },
        max: { type: "number", default: 300, label: "Max entries", description: "Oldest entries are dropped after this many." },
    },

    log: [],

    describe(msg) {
        const { ChannelStore, GuildStore } = Obsid.common;
        const ch = ChannelStore?.getChannel?.(msg.channel_id);
        const guild = ch?.guild_id ? GuildStore?.getGuild?.(ch.guild_id) : null;
        const where = ch ? (guild ? `#${ch.name} · ${guild.name}` : ch.name ? ch.name : "DM") : "Unknown channel";
        return {
            author: msg.author?.globalName || msg.author?.global_name || msg.author?.username || "Unknown",
            where,
            attachments: (msg.attachments || []).map(a => a.url || a.proxy_url).filter(Boolean),
            sent: msg.timestamp ? new Date(msg.timestamp).toLocaleString() : "",
        };
    },
    skip(msg) {
        if (!msg) return true;
        const me = Obsid.common.UserStore?.getCurrentUser?.();
        if (this.settings.ignoreSelf && me && msg.author?.id === me.id) return true;
        if (this.settings.ignoreBots && msg.author?.bot) return true;
        return false;
    },
    add(entry) {
        this.log.unshift({ ...entry, at: new Date().toLocaleTimeString() });
        const max = Math.max(10, Number(this.settings.max) || 300);
        if (this.log.length > max) this.log.length = max;
    },

    start() {
        const { FluxDispatcher, MessageStore } = Obsid.common;
        if (!FluxDispatcher || !MessageStore) throw new Error("Couldn't find Discord's message modules");

        this.unpatch = Obsid.patcher.before(FluxDispatcher, "dispatch", ([action]) => {
            try {
                if (action?.type === "MESSAGE_DELETE") {
                    const msg = MessageStore.getMessage(action.channelId, action.id);
                    if (this.skip(msg) || (!msg.content && !msg.attachments?.length)) return;
                    this.add({ kind: "deleted", content: msg.content, ...this.describe(msg) });
                    if (this.settings.toast)
                        Obsid.ui.toast(`${this.describe(msg).author} deleted: ${(msg.content || "[attachment]").slice(0, 80)}`);
                } else if (action?.type === "MESSAGE_UPDATE" && this.settings.edits) {
                    const next = action.message;
                    if (!next?.id || typeof next.content !== "string") return;
                    const msg = MessageStore.getMessage(next.channel_id, next.id);
                    if (this.skip(msg) || msg.content === next.content) return;
                    this.add({ kind: "edited", content: msg.content, after: next.content, ...this.describe(msg) });
                }
            } catch (e) { this.logger.error(e); }
        });
    },
    stop() { this.unpatch?.(); },

    settingsPanel() {
        const { ui } = Obsid;
        const { h } = ui;
        const list = h("div", { class: "obsid-list", style: { maxHeight: "360px", overflow: "auto" } });
        const render = () => {
            list.replaceChildren(...(this.log.length ? this.log.map(e => ui.card({ class: "obsid-pad", style: { display: "flex", flexDirection: "column", gap: "4px" } },
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
