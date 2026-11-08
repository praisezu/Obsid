Obsid.definePlugin({
    name: "SilentMessages",
    description: "Sends your messages as @silent so they don't push-notify anyone (mentions still show up).",
    authors: ["Obsid"],
    category: "Chat",
    options: {
        skipDMs: { type: "boolean", default: true, label: "Not in DMs", description: "Send DMs and group DMs normally." },
    },

    start() {
        const SUPPRESS_NOTIFICATIONS = 1 << 12;
        this.untransform = Obsid.net.transform(({ method, url, body }) => {
            const m = method === "POST" && url.match(/\/channels\/(\d+)\/messages$/);
            if (!m) return;
            if (this.settings.skipDMs) {
                const channel = Obsid.common.ChannelStore?.getChannel(m[1]);
                if (channel && !channel.guild_id) return;
            }
            const data = JSON.parse(body);
            data.flags = (data.flags || 0) | SUPPRESS_NOTIFICATIONS;
            return JSON.stringify(data);
        });
    },
    stop() { this.untransform?.(); },
});
