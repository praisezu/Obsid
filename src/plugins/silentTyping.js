// Example of a webpack-based plugin: finds Discord's typing module and replaces startTyping.
// If the module can't be found (Discord changed it), falls back to blocking the HTTP request.
Obsid.definePlugin({
    name: "SilentTyping",
    description: "Hides your typing indicator from other people.",
    authors: ["Obsid"],
    category: "Privacy",
    needsWebpack: true,

    async start() {
        try {
            const TypingActions = await Obsid.webpack.waitFor(
                Obsid.webpack.filters.byProps("startTyping", "stopTyping"), 15000);
            this.unpatch = Obsid.patcher.instead(TypingActions, "startTyping", () => { });
            this.logger.log("Patched TypingActions.startTyping");
        } catch {
            this.logger.warn("Typing module not found, falling back to request blocking");
            this.unpatch = Obsid.net.block(({ method, url }) =>
                method === "POST" && /\/channels\/\d+\/typing$/.test(url));
        }
    },
    stop() {
        this.unpatch?.();
    },
});
