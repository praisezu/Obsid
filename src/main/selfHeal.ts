/*
 * Auto re-install, in-app half. Discord installs updates into a new version folder (or a new
 * discord_desktop_core module folder) with a stock index.js, which would drop Vanta. Vanta checks
 * every Discord version folder next to the running one and re-adds the injection where it's
 * missing: at startup, every 10 minutes, and while Discord quits (updates are often downloaded
 * while Discord runs and switched to on the next launch).
 * Vanta Guard (in the installer) covers the case where Discord installs an update right at
 * startup, before any of this can run.
 */
import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

export const MARKER = "// Vanta injection";
const LEGACY_MARKER = "// Obsid injection";

export function injectionCode(mainEntry: string) {
    return [
        MARKER,
        "try {",
        `    require(${JSON.stringify(mainEntry)});`,
        "} catch (e) {",
        '    console.error("[Vanta] failed to load, starting Discord without it:", e);',
        "}",
        "module.exports = require('./core.asar');",
        "",
    ].join("\n");
}

const isStock = (content: string) =>
    content.replace(/\s+/g, "").replace(/"/g, "'") === "module.exports=require('./core.asar');";

/** Finds discord_desktop_core index.js files in every Discord version folder next to `loadedFrom`. */
function coreIndexFiles(loadedFrom: string) {
    // loadedFrom: …/<version>/modules/discord_desktop_core[-N]/[discord_desktop_core/]index.js
    const parts = loadedFrom.split(path.sep);
    const mi = parts.lastIndexOf("modules");
    if (mi < 2) return [];
    const base = parts.slice(0, mi - 1).join(path.sep);
    const out: string[] = [];
    let versions: string[] = [];
    try { versions = fs.readdirSync(base).filter(v => /^app-\d|^\d+\.\d+\.\d+$/.test(v)); } catch { return []; }
    for (const v of versions) {
        const modules = path.join(base, v, "modules");
        let cores: string[] = [];
        try { cores = fs.readdirSync(modules).filter(c => /^discord_desktop_core(-\d+)?$/.test(c)); } catch { continue; }
        for (const c of cores) {
            for (const candidate of [path.join(modules, c, "discord_desktop_core", "index.js"), path.join(modules, c, "index.js")])
                if (fs.existsSync(candidate)) out.push(candidate);
        }
    }
    return out;
}

function heal(loadedFrom: string, mainEntry: string, log: (...a: unknown[]) => void) {
    for (const file of coreIndexFiles(loadedFrom)) {
        try {
            const content = fs.readFileSync(file, "utf8");
            if (content.includes(MARKER) || content.includes(LEGACY_MARKER)) continue;
            if (!isStock(content)) continue; // another mod owns this file; don't fight it
            fs.writeFileSync(file + ".vanta-backup", content);
            fs.writeFileSync(file, injectionCode(mainEntry));
            log("Re-added Vanta after a Discord update:", file);
        } catch (e) { log("Couldn't re-add Vanta to", file, e); }
    }
}

export function startSelfHeal(mainEntry: string, log: (...a: unknown[]) => void) {
    // The discord_desktop_core index.js that loaded us
    const loadedFrom = (module as any).parent?.filename ?? require.main?.filename ?? "";
    if (!loadedFrom || !/discord_desktop_core/.test(loadedFrom)) return; // not a normal injection (dev/session-preload)
    const run = () => heal(loadedFrom, mainEntry, log);
    setTimeout(run, 30_000);
    setInterval(run, 10 * 60_000).unref?.();
    app.on("before-quit", run);
}
