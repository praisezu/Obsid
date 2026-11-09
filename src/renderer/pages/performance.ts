/*
 * Speed panel: what each switched-on plugin costs. CPU time is measured around every callback a plugin set up
 * (watchers, Discord events, patches, timers). Browsers can't measure memory per plugin, so memory is shown for
 * Discord's page as a whole.
 */
import { ui, h } from "../ui/components";
import { plugins, isPluginEnabled, setPluginEnabled } from "../core/plugins";
import { health } from "../core/health";

const fmt = (ms: number) => ms < 1 ? "<1 ms" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

ui.registerPage({
    id: "performance",
    label: "Performance",
    icon: "power",
    order: 2.2,
    keywords: ["speed", "lag", "cpu", "memory", "slow", "performance", "crash shield", "errors"],
    render() {
        const body = h("div", { style: { display: "contents" } });
        const root = h("div", { class: "vanta-page" },
            ui.pageHead("Performance", "What each plugin you've switched on costs. Updated every 2 seconds."), body);

        const draw = () => {
            const mem = (performance as any).memory;
            const rows = [...plugins.values()].filter(p => isPluginEnabled(p.name)).map(p => {
                const s = health.stats(p.name);
                // busiest of this minute so far and the last full minute
                const ms = Math.max(s?.ms ?? 0, s?.lastMs ?? 0), calls = Math.max(s?.calls ?? 0, s?.lastCalls ?? 0);
                return { p, s, ms, calls };
            }).sort((a, b) => b.ms - a.ms);
            const total = rows.reduce((t, r) => t + r.ms, 0);
            const level = (ms: number) => ms > 1500 ? "danger" : ms > 300 ? "warn" : "ok";
            body.replaceChildren(
                ui.card({ class: "vanta-pad" }, h("dl", { class: "vanta-kv" },
                    h("dt", {}, "Plugins on"), h("dd", {}, String(rows.length)),
                    h("dt", {}, "Plugin CPU time"), h("dd", {}, `${fmt(total)} per minute (${(total / 600).toFixed(2)}% of one core)`),
                    mem ? [h("dt", {}, "Discord's memory"), h("dd", {}, `${Math.round(mem.usedJSHeapSize / 1048576)} MB`)] : null,
                    h("dt", {}, "Page elements"), h("dd", {}, document.getElementsByTagName("*").length.toLocaleString()))),
                ui.note("", "Crash shield is on: a plugin that throws 8 errors within a minute is switched off and you're told which one."),
                rows.length ? h("div", { class: "vanta-list" }, rows.map(({ p, s, ms, calls }) => ui.card({ class: "vanta-pad" },
                    h("div", { class: "vanta-item-top" },
                        h("div", { class: "vanta-item-name" }, p.name, ui.tag(fmt(ms) + "/min", level(ms), "CPU time in the busiest recent minute"),
                            s?.errors ? ui.tag(`${s.errors} error${s.errors > 1 ? "s" : ""}`, "danger", s.lastError ?? "") : null),
                        ui.button("Turn off", { small: true, variant: "ghost", onClick: async () => { await setPluginEnabled(p.name, false); draw(); } })),
                    h("div", { class: "vanta-item-desc" },
                        `${calls.toLocaleString()} calls/min · started in ${fmt(s?.startMs ?? 0)}` + (s?.lastError ? ` · last error: ${s.lastError}` : ""))))
                ) : ui.empty("No plugins are switched on.", "plugins"));
        };
        draw();
        const timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); draw(); }, 2000);
        return root;
    },
});
