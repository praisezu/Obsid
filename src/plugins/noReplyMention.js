Obsid.definePlugin({
    name: "NoReplyMention",
    description: "Never @mention the person you're replying to (the reply ping toggle is forced off).",
    authors: ["Obsid"],
    category: "Chat",

    start() {
        this.untransform = Obsid.net.transform(({ method, url, body }) => {
            if (method !== "POST" || !/\/channels\/\d+\/messages$/.test(url)) return;
            const data = JSON.parse(body);
            if (!data.message_reference) return;
            data.allowed_mentions = {
                parse: ["users", "roles", "everyone"],
                ...data.allowed_mentions,
                replied_user: false,
            };
            return JSON.stringify(data);
        });
    },
    stop() {
        this.untransform?.();
    },
});
