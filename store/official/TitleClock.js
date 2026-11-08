/**
 * @name TitleClock
 * @author Vanta
 * @version 1.0.0
 * @description Shows the current time at the start of Discord's window title.
 * @tags utility
 */
Vanta.definePlugin({
    name: "TitleClock",
    description: "Shows the current time at the start of Discord's window title.",
    authors: ["Vanta"],
    category: "Utility",
    options: {
        seconds: { type: "boolean", default: false, label: "Show seconds" },
    },

    stamp() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: this.settings.seconds ? "2-digit" : undefined });
    },
    strip(title) {
        return title.replace(/^\[[^\]]{4,12}\] /, "");
    },
    tick() {
        const next = `[${this.stamp()}] ${this.strip(document.title)}`;
        if (document.title !== next) document.title = next;
    },
    start() {
        this.tick();
        this.timer = setInterval(() => this.tick(), 1000);
    },
    stop() {
        clearInterval(this.timer);
        document.title = this.strip(document.title);
    },
});
