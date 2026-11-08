// Developer plugins. They cost nothing until switched on.
import { definePlugin, common, patcher, net } from "@api";

export default [
    definePlugin({
        name: "FluxLogger",
        description: "Logs Discord's internal events (Flux actions) to the DevTools console. For plugin developers.",
        authors: ["Obsid"], category: "Developer",
        needsWebpack: true,
        options: {
            filter: { type: "string", default: "", label: "Only types matching", placeholder: "MESSAGE_|TYPING", description: "A regex. Empty = everything." },
            ignore: { type: "string", default: "^(TRACK|EXPERIMENT|SPOTIFY_PLAYER|RTC_CONNECTION_PING|WINDOW_FOCUS)", label: "Ignore types matching" },
        },
        start() {
            const D = common.FluxDispatcher;
            if (!D) throw new Error("Dispatcher not found");
            const re = (s: unknown) => { try { return s ? new RegExp(String(s)) : null; } catch { return null; } };
            this.unpatch = patcher.before(D, "dispatch", ([action]: any[]) => {
                const type = String(action?.type ?? "?");
                const only = re(this.settings.filter), skip = re(this.settings.ignore);
                if ((only && !only.test(type)) || (skip && skip.test(type))) return;
                console.log("%c[Flux]%c " + type, "color:#a78bfa;font-weight:bold", "color:inherit", action);
            });
        },
        stop() { this.unpatch?.(); },
    }),
    definePlugin({
        name: "NetworkLogger",
        description: "Logs every API request Discord makes to the DevTools console. For plugin developers.",
        authors: ["Obsid"], category: "Developer",
        options: { filter: { type: "string", default: "/api/", label: "Only URLs containing" } },
        start() {
            // A blocker that never blocks: it just observes.
            this.off = net.block(({ method, url, body }) => {
                const f = String(this.settings.filter || "");
                if (!f || url.includes(f)) console.log("%c[Net]%c " + method + " " + url, "color:#a78bfa;font-weight:bold", "color:inherit", typeof body === "string" && body.length < 2000 ? body : body ?? "");
                return false;
            });
        },
        stop() { this.off?.(); },
    }),
];
