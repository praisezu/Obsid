/**
 * @name HelloVanta
 * @author Vanta
 * @version 1.0.0
 * @description Example plugin: greets you when it starts and counts the messages you send.
 */
Vanta.definePlugin({
    name: "HelloVanta",
    description: "Example imported plugin: greets you when it starts and counts the messages you send.",
    authors: ["Vanta"],
    category: "Examples",
    options: {
        greeting: { type: "string", default: "Hello from an imported plugin!", label: "Greeting" },
    },

    sent: 0,
    start() {
        Vanta.ui.toast(this.settings.greeting);
        this.unwatch = Vanta.net.transform(({ method, url }) => {
            if (method === "POST" && /\/channels\/\d+\/messages$/.test(url)) this.logger.log("Messages sent:", ++this.sent);
        });
    },
    stop() {
        this.unwatch?.();
    },
});
