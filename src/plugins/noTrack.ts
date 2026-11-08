import { definePlugin, net } from "@api";

export default definePlugin({
    name: "NoTrack",
    description: "Blocks Discord's analytics (science/metrics) requests and Sentry crash reporting.",
    authors: ["Vanta"],
    category: "Privacy",
    enabledByDefault: true,

    start() {
        const pattern = /\/api\/v\d+\/(science|metrics)\b|sentry\.io|\/error-reporting-proxy\//;
        this.unblock = net.block(({ url }) => pattern.test(url));
    },
    stop() {
        this.unblock?.();
    },
});
