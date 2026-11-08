#!/usr/bin/env node
/*
 * Obsid installer — injects Obsid into Discord's discord_desktop_core/index.js.
 *
 *   node scripts/install.js                 inject into Discord Stable
 *   node scripts/install.js --branch canary inject into Canary (stable|ptb|canary|development)
 *   node scripts/install.js --uninstall     restore the original file
 *   node scripts/install.js --status        show where Discord is and whether Obsid is injected
 *   add --dry-run to print what would happen without writing anything
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const BRANCH = opt("--branch", "stable").toLowerCase();
const DRY = flag("--dry-run");
const MODE = flag("--uninstall") ? "uninstall" : flag("--status") ? "status" : "install";

// Points Discord at this checkout's build output (run `npm run build` first).
const MAIN_ENTRY = path.resolve(__dirname, "..", "dist", "main.js");
const MARKER = "// Obsid injection";
const DEFAULT_INDEX = "module.exports = require('./core.asar');\n";

const DIR_NAMES = {
    win32: { stable: "Discord", ptb: "DiscordPTB", canary: "DiscordCanary", development: "DiscordDevelopment" },
    other: { stable: "discord", ptb: "discordptb", canary: "discordcanary", development: "discorddevelopment" },
};

const versionKey = s => (s.match(/\d+/g) || []).map(n => n.padStart(8, "0")).join(".");
const newest = (dir, re) => {
    try {
        return fs.readdirSync(dir).filter(n => re.test(n)).sort((a, b) => versionKey(b).localeCompare(versionKey(a)))[0];
    } catch { return undefined; }
};

function findCoreIndex() {
    const names = process.platform === "win32" ? DIR_NAMES.win32 : DIR_NAMES.other;
    const name = names[BRANCH];
    if (!name) throw new Error(`Unknown branch "${BRANCH}". Use stable, ptb, canary or development.`);

    if (process.platform === "win32") {
        // %LOCALAPPDATA%\Discord\app-1.0.xxxx\modules\discord_desktop_core-1\discord_desktop_core\index.js
        const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), name);
        const appDir = newest(base, /^app-\d/);
        if (!appDir) throw new Error(`Discord ${BRANCH} not found in ${base}`);
        const modules = path.join(base, appDir, "modules");
        const coreDir = newest(modules, /^discord_desktop_core(-\d+)?$/);
        if (!coreDir) throw new Error(`discord_desktop_core not found in ${modules}. Launch Discord once so it finishes updating.`);
        return { version: appDir, file: path.join(modules, coreDir, "discord_desktop_core", "index.js") };
    }

    // macOS: ~/Library/Application Support/discord/0.0.xxx/modules/discord_desktop_core/index.js
    // Linux: ~/.config/discord/0.0.xx/modules/discord_desktop_core/index.js
    const base = process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", name)
        : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), name);
    const ver = newest(base, /^\d+\.\d+\.\d+$/);
    if (!ver) throw new Error(`Discord ${BRANCH} not found in ${base}`);
    return { version: ver, file: path.join(base, ver, "modules", "discord_desktop_core", "index.js") };
}

function discordRunning() {
    try {
        if (process.platform === "win32") return /discord/i.test(execSync("tasklist /FO CSV /NH", { encoding: "utf8" }));
        return /discord/i.test(execSync("ps -A -o comm=", { encoding: "utf8" }));
    } catch { return false; }
}

function write(file, data) {
    if (DRY) { console.log(`[dry-run] would write ${file}:\n${data}`); return; }
    fs.writeFileSync(file, data);
}

function main() {
    const { version, file } = findCoreIndex();
    if (!fs.existsSync(file)) throw new Error(`${file} does not exist`);
    const current = fs.readFileSync(file, "utf8");
    const injected = current.includes(MARKER);
    const backup = file + ".obsid-backup";

    console.log(`Discord ${BRANCH} ${version}`);
    console.log(`  ${file}`);

    if (MODE === "status") {
        console.log(injected ? "  Obsid is injected." : "  Obsid is NOT injected.");
        if (injected) console.log("  " + (current.match(/require\((".*?")\)/)?.[1] ?? ""));
        return;
    }

    if (MODE === "uninstall") {
        if (!injected) { console.log("Obsid isn't injected here. Nothing to do."); return; }
        const original = fs.existsSync(backup) ? fs.readFileSync(backup, "utf8") : DEFAULT_INDEX;
        write(file, original);
        if (!DRY && fs.existsSync(backup)) fs.unlinkSync(backup);
        console.log("Uninstalled. Fully quit Discord (tray icon → Quit) and reopen it.");
        return;
    }

    if (!fs.existsSync(MAIN_ENTRY)) throw new Error(`Can't find ${MAIN_ENTRY}. Run \`npm run build\` first.`);
    if (!injected && !DRY) fs.writeFileSync(backup, current);

    write(file, [
        MARKER,
        "try {",
        `    require(${JSON.stringify(MAIN_ENTRY)});`,
        "} catch (e) {",
        '    console.error("[Obsid] failed to load, starting Discord without it:", e);',
        "}",
        "module.exports = require('./core.asar');",
        "",
    ].join("\n"));

    console.log(injected ? "Re-injected (updated path)." : "Injected!");
    console.log(discordRunning()
        ? "Discord is running. Fully quit it (tray icon → Quit Discord) and reopen it to load Obsid."
        : "Start Discord to load Obsid. Press Ctrl+Shift+O for settings.");
    console.log("Note: Discord updates install into a new app folder. Re-run this after an update.");
}

try { main(); }
catch (e) { console.error("Error:", e.message); process.exit(1); }
