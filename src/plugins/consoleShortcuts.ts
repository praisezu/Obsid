import { definePlugin, webpack, common, patcher } from "@api";

export default definePlugin({
    name: "ConsoleShortcuts",
    description: "Adds shortcuts to the DevTools console for plugin development: wp, findByProps, findByCode, common, Obsid.",
    authors: ["Obsid"],
    category: "Developer",

    start() {
        const w = webpack;
        this.added = {
            wp: w,
            findByProps: (...p) => w.findByProps(...p),
            findByCode: (...c) => w.findByCode(...c),
            findAll: f => w.findAll(f),
            common: common,
            patcher: patcher,
        };
        for (const [k, v] of Object.entries(this.added)) if (!(k in window)) window[k] = v;
        this.logger.log("Console shortcuts ready: wp, findByProps, findByCode, findAll, common, patcher");
    },
    stop() {
        for (const [k, v] of Object.entries(this.added || {})) if (window[k] === v) delete window[k];
    },
});
