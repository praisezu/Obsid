/*
 * Obsid — Electron main process.
 *
 * Loaded by Discord's discord_desktop_core/index.js BEFORE core.asar (the installer adds a
 * require() for dist/main.js), so we can swap electron.BrowserWindow for a subclass that points
 * Discord's main window at Obsid's preload. The preload then loads Discord's own preload.
 */
import * as electron from "electron";
import { app, ipcMain, shell, dialog, BrowserWindow as ElectronBrowserWindow, type IpcMainInvokeEvent } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

import type { BackupData, BackupParts, RendererScript, ThemeFile } from "@shared/types";
import { parseMeta, safeName } from "./util";
import { updaterInfo, updaterCheck, updaterApply } from "./updater";
import { installCspPatch } from "./csp";

const g = globalThis as any;
if (!g.__OBSID_LOADED__) {
    g.__OBSID_LOADED__ = true;
    main();
}

function main() {
    const DIST = __dirname;
    const ROOT = path.join(DIST, "..");
    const PRELOAD = path.join(DIST, "preload.js");
    const DATA_DIR = path.join(app.getPath("appData"), "Obsid");
    const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
    const QUICKCSS_FILE = path.join(DATA_DIR, "quickCss.css");
    const USER_PLUGINS_DIR = path.join(DATA_DIR, "plugins");
    const THEMES_DIR = path.join(DATA_DIR, "themes");
    const VERSION = __OBSID_VERSION__;
    const MAX_PLUGIN_SIZE = 2 * 1024 * 1024;

    const log = (...a: unknown[]) => console.log("[Obsid]", ...a);

    // Let themes load CSS/fonts/images from other sites (Discord's CSP blocks @import otherwise).
    app.whenReady().then(() => {
        try { installCspPatch(); log("Theme content policy patch installed"); }
        catch (e) { console.error("[Obsid] couldn't patch the content security policy:", e); }
    });

    for (const d of [USER_PLUGINS_DIR, THEMES_DIR]) fs.mkdirSync(d, { recursive: true });
    if (!fs.existsSync(QUICKCSS_FILE)) fs.writeFileSync(QUICKCSS_FILE, "/* Obsid Quick CSS */\n");
    copyBundledThemes();

    /* ------------------------------------------------------------ files */

    function readText(file: string, fallback = "") {
        try { return fs.readFileSync(file, "utf8"); } catch { return fallback; }
    }

    function writeAtomic(file: string, data: string) {
        const tmp = file + ".tmp";
        fs.writeFileSync(tmp, data);
        fs.renameSync(tmp, file);
    }

    function readSettings() {
        try { return JSON.parse(readText(SETTINGS_FILE, "{}")); }
        catch (e: any) { log("settings.json is invalid, using defaults:", e.message); return {}; }
    }

    function listFiles(dir: string, ext: string) {
        try { return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(ext)).sort(); }
        catch { return []; }
    }

    /** Copies the themes shipped with Obsid into the user's themes folder, once each. */
    function copyBundledThemes() {
        try {
            const marker = path.join(DATA_DIR, ".bundled-themes");
            const seen = new Set(fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").split("\n").filter(Boolean) : []);
            const bundled = path.join(ROOT, "themes");
            for (const f of fs.existsSync(bundled) ? fs.readdirSync(bundled) : []) {
                if (!f.endsWith(".css") || seen.has(f)) continue;
                const dest = path.join(THEMES_DIR, f);
                if (!fs.existsSync(dest)) fs.copyFileSync(path.join(bundled, f), dest);
                seen.add(f);
            }
            fs.writeFileSync(marker, [...seen].join("\n"));
        } catch (e) { console.error("[Obsid] couldn't copy bundled themes:", e); }
    }

    /** Tags a user plugin's definePlugin() call with its file name so the UI can update/delete it. */
    function wrapUserPlugin(file: string, code: string) {
        return `window.Obsid && (Obsid.__currentFile = ${JSON.stringify(file)});\ntry {\n${code}\n} finally { window.Obsid && (Obsid.__currentFile = null); }`;
    }

    /** What the preload runs, in order: Obsid itself, the user's plugins, then boot. */
    function rendererScripts(): RendererScript[] {
        return [
            { name: "renderer.js", code: readText(path.join(DIST, "renderer.js")) },
            ...listFiles(USER_PLUGINS_DIR, ".js").map(f => ({
                name: "user-plugins/" + f,
                code: wrapUserPlugin(f, readText(path.join(USER_PLUGINS_DIR, f))),
            })),
            { name: "boot.js", code: "window.Obsid?.__boot?.();" },
        ];
    }

    function listThemes(): ThemeFile[] {
        return listFiles(THEMES_DIR, ".css").map(file => {
            const css = readText(path.join(THEMES_DIR, file));
            return { file, css, meta: parseMeta(css) };
        });
    }

    /* -------------------------------------------------------------- IPC */

    const sendAll = (channel: string, ...args: unknown[]) => {
        for (const wc of electron.webContents.getAllWebContents())
            if (!wc.isDestroyed()) wc.send(channel, ...args);
    };
    const winOf = (e: IpcMainInvokeEvent) => ElectronBrowserWindow.fromWebContents(e.sender)!;
    const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
        ipcMain.handle("obsid:" + channel, fn);

    ipcMain.on("obsid:get-renderer", e => { e.returnValue = rendererScripts(); });
    ipcMain.on("obsid:get-settings", e => { e.returnValue = readSettings(); });
    ipcMain.on("obsid:get-quickcss", e => { e.returnValue = readText(QUICKCSS_FILE); });
    ipcMain.on("obsid:get-themes", e => { e.returnValue = listThemes(); });
    ipcMain.on("obsid:get-info", e => {
        e.returnValue = {
            version: VERSION, repo: __OBSID_REPO__, root: ROOT, dataDir: DATA_DIR, pluginsDir: USER_PLUGINS_DIR, themesDir: THEMES_DIR,
            electron: process.versions.electron, chrome: process.versions.chrome, discord: app.getVersion(),
        };
    });

    handle("set-settings", (_, s) => writeAtomic(SETTINGS_FILE, JSON.stringify(s, null, 4)));
    handle("reset-settings", () => writeAtomic(SETTINGS_FILE, "{}"));
    handle("set-quickcss", (_, css) => { ignoreWatch.add(QUICKCSS_FILE); writeAtomic(QUICKCSS_FILE, String(css)); });
    handle("open-path", (_, which) => {
        if (which === "quickcss") return shell.openPath(QUICKCSS_FILE);
        const dirs: Record<string, string> = { data: DATA_DIR, plugins: USER_PLUGINS_DIR, themes: THEMES_DIR, root: ROOT };
        return shell.openPath(dirs[which] || DATA_DIR);
    });
    handle("open-url", (_, url) => { if (/^https:\/\//.test(String(url))) return shell.openExternal(String(url)); });
    handle("toggle-devtools", e => e.sender.toggleDevTools());
    handle("relaunch", () => { app.relaunch(); app.exit(0); });

    // themes
    handle("write-theme", (_, file, css) => writeAtomic(path.join(THEMES_DIR, safeName(file, ".css")), String(css)));
    handle("trash-theme", (_, file) => shell.trashItem(path.join(THEMES_DIR, safeName(file, ".css"))));
    handle("fetch-theme", async (_, url) => {
        if (!/^https:\/\/\S+$/i.test(String(url))) throw new Error("Theme URLs must start with https://");
        const res = await fetch(String(url), { redirect: "follow" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > 5 * 1024 * 1024) throw new Error("Theme is larger than 5 MB");
        return text;
    });

    // Plain GET for plugins (Discord's CSP blocks most direct requests from the page).
    handle("fetch-text", async (_, url) => {
        if (!/^https:\/\/\S+$/i.test(String(url))) throw new Error("Only https:// URLs are allowed");
        const res = await fetch(String(url), { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 Obsid" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > 2 * 1024 * 1024) throw new Error("Response is larger than 2 MB");
        return text;
    });

    // plugin import
    const pluginFileName = (n: string) => safeName(String(n).replace(/[^\w.\-]+/g, "_"), ".js");
    handle("plugin-pick-file", async e => {
        const { canceled, filePaths } = await dialog.showOpenDialog(winOf(e), {
            title: "Import Obsid plugin",
            properties: ["openFile"],
            filters: [{ name: "JavaScript plugin", extensions: ["js"] }],
        });
        if (canceled || !filePaths?.[0]) return null;
        if (fs.statSync(filePaths[0]).size > MAX_PLUGIN_SIZE) throw new Error("Plugin file is larger than 2 MB");
        return { fileName: path.basename(filePaths[0]), code: fs.readFileSync(filePaths[0], "utf8") };
    });
    handle("plugin-fetch", async (_, rawUrl) => {
        let url = String(rawUrl).trim();
        if (!/^https:\/\/\S+$/i.test(url)) throw new Error("Plugin links must start with https://");
        // GitHub "blob" page links → raw file links
        url = url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i, "https://raw.githubusercontent.com/$1/$2/");
        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
        const code = await res.text();
        if (code.length > MAX_PLUGIN_SIZE) throw new Error("Plugin is larger than 2 MB");
        if (/^\s*</.test(code)) throw new Error("That link returned a web page, not a .js file. Use the raw file link.");
        const name = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "plugin.js");
        return { fileName: name.endsWith(".js") ? name : name + ".js", code, url };
    });
    handle("plugin-install", (_, fileName, code) => {
        const name = pluginFileName(fileName);
        writeAtomic(path.join(USER_PLUGINS_DIR, name), String(code));
        return name;
    });
    handle("plugin-exists", (_, fileName) => fs.existsSync(path.join(USER_PLUGINS_DIR, pluginFileName(fileName))));
    handle("plugin-run", async (e, file) => {
        const name = safeName(file, ".js");
        const code = wrapUserPlugin(name, readText(path.join(USER_PLUGINS_DIR, name)));
        // `void 0`: the script's last value (the plugin object) can't be sent back over IPC.
        await e.sender.executeJavaScript(`${code};\nvoid 0;\n//# sourceURL=obsid://user-plugins/${name}`);
    });
    handle("plugin-trash", (_, file) => shell.trashItem(path.join(USER_PLUGINS_DIR, safeName(file, ".js"))));
    handle("plugin-read", (_, file) => readText(path.join(USER_PLUGINS_DIR, safeName(file, ".js"))));

    // updater
    handle("updater-info", () => updaterInfo(ROOT, VERSION));
    handle("updater-check", () => updaterCheck(ROOT, VERSION));
    handle("updater-apply", () => updaterApply(ROOT, VERSION));

    // backup
    handle("backup-export", async (e, data: BackupData) => {
        const stamp = new Date().toISOString().slice(0, 10);
        const { canceled, filePath } = await dialog.showSaveDialog(winOf(e), {
            title: "Export Obsid backup",
            defaultPath: path.join(app.getPath("downloads"), `obsid-backup-${stamp}.json`),
            filters: [{ name: "Obsid backup", extensions: ["json"] }],
        });
        if (canceled || !filePath) return null;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return filePath;
    });
    handle("backup-import", async e => {
        const { canceled, filePaths } = await dialog.showOpenDialog(winOf(e), {
            title: "Import Obsid backup",
            properties: ["openFile"],
            filters: [{ name: "Obsid backup", extensions: ["json"] }],
        });
        if (canceled || !filePaths?.[0]) return null;
        const data = JSON.parse(fs.readFileSync(filePaths[0], "utf8"));
        if (data?.obsidBackup !== 1) throw new Error("That file isn't an Obsid backup.");
        return data;
    });
    handle("backup-apply", (_, data: BackupData, parts: BackupParts) => {
        if (parts.settings && data.settings) writeAtomic(SETTINGS_FILE, JSON.stringify(data.settings, null, 4));
        if (parts.quickCss && typeof data.quickCss === "string") { ignoreWatch.add(QUICKCSS_FILE); writeAtomic(QUICKCSS_FILE, data.quickCss); }
        if (parts.themes && data.themes)
            for (const [file, css] of Object.entries(data.themes)) writeAtomic(path.join(THEMES_DIR, safeName(file, ".css")), String(css));
    });

    /* --------------------------------------------- watch external edits */

    const ignoreWatch = new Set<string>();
    function watch(target: string, onChange: () => void) {
        let t: NodeJS.Timeout | undefined;
        try {
            fs.watch(target, (_, file) => {
                clearTimeout(t);
                t = setTimeout(() => {
                    const full = file && target !== QUICKCSS_FILE ? path.join(target, String(file)) : target;
                    if (ignoreWatch.delete(full)) return;
                    onChange();
                }, 150);
            });
        } catch (e: any) { log("watch failed for", target, e.message); }
    }
    watch(QUICKCSS_FILE, () => sendAll("obsid:quickcss-changed", readText(QUICKCSS_FILE)));
    watch(THEMES_DIR, () => sendAll("obsid:themes-changed"));

    /* -------------------------------------------------- window patching */

    const ORIGINAL_PRELOAD_ARG = "--obsid-original-preload=";
    const shouldInject = (o: Electron.BrowserWindowConstructorOptions) => {
        const p = o?.webPreferences?.preload;
        return typeof p === "string" && !/splash/i.test(p);
    };

    class BrowserWindow extends electron.BrowserWindow {
        constructor(options: Electron.BrowserWindowConstructorOptions = {}) {
            // TransparentWindow plugin: window options can only be set at creation (hence its restart prompt).
            let material: string | null = null;
            if (shouldInject(options)) {
                const tw = readSettings()?.plugins?.TransparentWindow;
                if (tw?.enabled) {
                    options.transparent = true;
                    options.backgroundColor = "#00000000";
                    material = String(tw.options?.material ?? "acrylic");
                }
            }
            if (shouldInject(options)) {
                const wp = options.webPreferences!;
                const original = wp.preload!;
                wp.preload = PRELOAD;
                wp.sandbox = false; // our preload needs require() to chain Discord's preload
                wp.additionalArguments = [...(wp.additionalArguments || []), ORIGINAL_PRELOAD_ARG + original];
                log("Injecting into window, original preload:", original);
            }
            super(options);
            if (material && material !== "none" && process.platform === "win32" && typeof (this as any).setBackgroundMaterial === "function") {
                try { (this as any).setBackgroundMaterial(material); } catch (e) { log("setBackgroundMaterial failed:", e); }
            }
        }
    }

    const electronPath = require.resolve("electron");
    const cached = require.cache[electronPath];
    if (cached) {
        delete (cached as any).exports;
        cached.exports = { ...electron, BrowserWindow };
        log(`v${VERSION} loaded (BrowserWindow patched)`);
    } else {
        // Fallback: session-wide preload that runs alongside Discord's preload.
        app.whenReady().then(() => {
            const ses = electron.session.defaultSession as any;
            if (ses.registerPreloadScript) ses.registerPreloadScript({ type: "frame", filePath: PRELOAD });
            else ses.setPreloads([...ses.getPreloads(), PRELOAD]);
            log(`v${VERSION} loaded (session preload fallback)`);
        });
    }
}
