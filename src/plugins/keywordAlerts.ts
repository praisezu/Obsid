import { definePlugin, common, ui } from "@api";

export default definePlugin({
    name: "KeywordAlerts",
    description: "Get notified when a message anywhere mentions words you care about, like your name or a game.",
    authors: ["Obsid"],
    category: "Chat",
    needsWebpack: true,
    options: {
        keywords: { type: "string", default: "", label: "Keywords", placeholder: "obsid, raid, my-nickname", description: "Separated by commas. Not case sensitive." },
        wholeWord: { type: "boolean", default: true, label: "Whole words only" },
        desktop: { type: "boolean", default: true, label: "Desktop notification", description: "Also show a Windows notification, not just an in-app one." },
        ignoreBots: { type: "boolean", default: true, label: "Ignore bots" },
        ignoreCurrent: { type: "boolean", default: true, label: "Not in the channel I'm looking at" },
    },

    matcher() {
        const words = String(this.settings.keywords || "").split(",").map(w => w.trim()).filter(Boolean);
        if (!words.length) return null;
        const esc = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const body = esc.join("|");
        return new RegExp(this.settings.wholeWord ? `(^|[^\\p{L}\\p{N}_])(${body})(?=$|[^\\p{L}\\p{N}_])` : `(${body})`, "iu");
    },

    start() {
        const { FluxDispatcher } = common;
        if (!FluxDispatcher) throw new Error("Couldn't find Discord's dispatcher");
        this.handler = ({ message, optimistic }) => {
            try {
                if (optimistic || !message?.content) return;
                const { UserStore, ChannelStore, GuildStore, SelectedChannelStore } = common;
                const me = UserStore?.getCurrentUser?.();
                if (me && message.author?.id === me.id) return;
                if (this.settings.ignoreBots && message.author?.bot) return;
                if (this.settings.ignoreCurrent && document.hasFocus() && SelectedChannelStore?.getChannelId?.() === message.channel_id) return;
                const re = this.matcher();
                const hit = re && message.content.match(re);
                if (!hit) return;
                const ch = ChannelStore?.getChannel?.(message.channel_id);
                const guild = ch?.guild_id ? GuildStore?.getGuild?.(ch.guild_id) : null;
                const who = message.author?.global_name || message.author?.username || "Someone";
                const where = ch?.name ? `#${ch.name}${guild ? " · " + guild.name : ""}` : "a DM";
                const word = hit[2] || hit[1];
                ui.toast(`"${word}" · ${who} in ${where}`);
                if (this.settings.desktop && "Notification" in window) {
                    const n = new Notification(`${who} mentioned "${word}"`, { body: `${where}\n${message.content.slice(0, 180)}`, silent: false });
                    n.onclick = () => { window.focus(); n.close(); };
                }
            } catch (e) { this.logger.error(e); }
        };
        FluxDispatcher.subscribe("MESSAGE_CREATE", this.handler);
    },
    stop() {
        if (this.handler) common.FluxDispatcher?.unsubscribe("MESSAGE_CREATE", this.handler);
    },
});
