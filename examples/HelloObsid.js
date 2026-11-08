/**
 * @name HelloObsid
 * @author You
 * @version 1.0.0
 * @description Example imported plugin: greets you when it starts and counts the messages you send.
 */
Obsid.definePlugin({
    name: "HelloObsid",
    description: "Example imported plugin: greets you when it starts and counts the messages you send.",
    authors: ["You"],
    category: "Examples",
    options: {
        greeting: { type: "string", default: "Hello from an imported plugin!", label: "Greeting" },
    },

    sent: 0,
    start() {
        Obsid.ui.toast(this.settings.greeting);
        this.unwatch = Obsid.net.transform(({ method, url }) => {
            if (method === "POST" && /\/channels\/\d+\/messages$/.test(url)) this.logger.log("Messages sent:", ++this.sent);
        });
    },
    stop() {
        this.unwatch?.();
    },
});
