Obsid.definePlugin({
    name: "NoDevToolsWarning",
    description: "Removes the giant \"Hold Up!\" warning Discord prints in DevTools, so the console stays readable.",
    authors: ["Obsid"],
    category: "Developer",
    enabledByDefault: true,

    PATTERN: /Hold Up!|If someone told you to copy\/paste|Unless you understand exactly what you are doing|your account security/i,
    start() {
        const drop = ([first, ...rest]) => [first, ...rest].some(a => typeof a === "string" && this.PATTERN.test(a));
        this.unpatches = ["log", "warn", "info"].map(m =>
            Obsid.patcher.instead(console, m, (args, orig) => drop(args) ? undefined : orig(...args)));
    },
    stop() { this.unpatches?.forEach(u => u()); },
});
