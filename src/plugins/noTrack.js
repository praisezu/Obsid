Obsid.definePlugin({
    name: "NoTrack",
    description: "Blocks Discord's analytics (science/metrics) requests and Sentry crash reporting.",
    authors: ["Obsid"],
    category: "Privacy",
    enabledByDefault: true,

    start() {
        const pattern = /\/api\/v\d+\/(science|metrics)\b|sentry\.io|\/error-reporting-proxy\//;
        this.unblock = Obsid.net.block(({ url }) => pattern.test(url));
    },
    stop() {
        this.unblock?.();
    },
});
