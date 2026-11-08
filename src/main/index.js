/*
 * Obsid — main process entry.
 *
 * Loaded by Discord's discord_desktop_core/index.js (see scripts/install.js)
 * BEFORE core.asar, so we can swap electron.BrowserWindow for our subclass.
 * Our subclass replaces the main window's preload with Obsid's preload, which
 * then loads Discord's original preload after injecting the renderer code.
 */
"use strict";

const electron = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

if (global.__OBSID_LOADED__) return;
global.__OBSID_LOADED__ = true;

const { app, ipcMain, shell, dialog, BrowserWindow: ElectronBrowserWindow } = electron;

const SRC = path.join(__dirname, "..");
const ROOT = path.join(SRC, "..");
const PRELOAD = path.join(SRC, "preload.js");
const DATA_DIR = path.join(app.getPath("appData"), "Obsid");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const QUICKCSS_FILE = path.join(DATA_DIR, "quickCss.css");
const USER_PLUGINS_DIR = path.join(DATA_DIR, "plugins");
const THEMES_DIR = path.join(DATA_DIR, "themes");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

for (const d of [USER_PLUGINS_DIR, THEMES_DIR]) fs.mkdirSync(d, { recursive: true });
if (!fs.existsSync(QUICKCSS_FILE)) fs.writeFileSync(QUICKCSS_FILE, "/* Obsid Quick CSS */\n");

// Copy bundled themes into the user's themes folder once (they can then edit or delete them).
try {
    const marker = path.join(DATA_DIR, ".bundled-themes");
    const seen = new Set(fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").split("\n").filter(Boolean) : []);
    const bundledDir = path.join(ROOT, "themes");
    for (const f of fs.existsSync(bundledDir) ? fs.readdirSync(bundledDir) : []) {
        if (!f.endsWith(".css") || seen.has(f)) continue;
        const dest = path.join(THEMES_DIR, f);
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(bundledDir, f), dest);
        seen.add(f);
    }
    fs.writeFileSync(marker, [...seen].join("\n"));
} catch (e) { console.error("[Obsid] couldn't copy bundled themes:", e); }

const log = (...a) => console.log("[Obsid]", ...a);

/* ---------------------------------------------------------------- files */

function readText(file, fallback = "") {
    try { return fs.readFileSync(file, "utf8"); } catch { return fallback; }
}

function writeAtomic(file, data) {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
}

function readSettings() {
    try { return JSON.parse(readText(SETTINGS_FILE, "{}")); }
    catch (e) { log("settings.json is invalid, using defaults:", e.message); return {}; }
}

function listFiles(dir, ext) {
    try { return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(ext)).sort(); }
    catch { return []; }
}

/** Only allow plain file names inside a folder we own. */
function safeName(name, ext) {
    const base = path.basename(String(name));
    if (!base || base !== String(name) || !base.toLowerCase().endsWith(ext)) throw new Error("Invalid file name");
    return base;
}

/** Renderer scripts, in load order. Re-read on every page load so Ctrl+R picks up edits. */
function buildRendererScripts() {
    const r = p => path.join(SRC, "renderer", p);
    const files = [
        r("core.js"),
        r("components.js"),
        r("themes.js"),
        r("pluginStore.js"),
        ...listFiles(path.join(SRC, "plugins"), ".js").map(f => path.join(SRC, "plugins", f)),
        ...listFiles(USER_PLUGINS_DIR, ".js").map(f => path.join(USER_PLUGINS_DIR, f)),
        ...listFiles(r("pages"), ".js").map(f => r(path.join("pages", f))),
        r("settingsSidebar.js"),
        r("quickPanel.js"),
        r("boot.js"),
    ];
    return files.map(f => {
        const rel = path.relative(SRC, f);
        const isUser = rel.startsWith("..");
        return {
            name: isUser ? "user-plugins/" + path.basename(f) : rel.replace(/\\/g, "/"),
            code: isUser ? wrapUserPlugin(path.basename(f), readText(f)) : readText(f),
        };
    });
}

/** Tags a user plugin's definePlugin() call with its file name so the UI can update/delete it. */
function wrapUserPlugin(file, code) {
    return `window.Obsid && (Obsid.__currentFile = ${JSON.stringify(file)});\ntry {\n${code}\n} finally { window.Obsid && (Obsid.__currentFile = null); }`;
}

/* --------------------------------------------------------------- themes */

function listThemes() {
    return listFiles(THEMES_DIR, ".css").map(file => {
        const css = readText(path.join(THEMES_DIR, file));
        return { file, css, meta: parseMeta(css) };
    });
}

/** Reads BetterDiscord-style metadata: / ** @name Foo  @author Bar ... * / */
function parseMeta(css) {
    const block = css.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    const meta = {};
    if (block) for (const m of block[1].matchAll(/@(\w+)[ \t]+([^\r\n]+)/g)) meta[m[1]] = m[2].trim();
    return meta;
}

/* -------------------------------------------------------------- updater */

function git(...args) {
    return new Promise(resolve => {
        execFile("git", args, { cwd: ROOT, windowsHide: true, timeout: 60000 }, (err, stdout, stderr) =>
            resolve({ ok: !err, out: String(stdout).trim(), err: String(stderr || err?.message || "").trim() }));
    });
}

async function updaterInfo() {
    const info = { version: VERSION, root: ROOT, git: false, gitInstalled: true, remote: null, branch: null, commit: null };
    const v = await git("--version");
    if (!v.ok) { info.gitInstalled = false; return info; }
    const inside = await git("rev-parse", "--is-inside-work-tree");
    if (!inside.ok || inside.out !== "true") return info;
    info.git = true;
    info.branch = (await git("rev-parse", "--abbrev-ref", "HEAD")).out || null;
    info.commit = (await git("log", "-1", "--format=%h %s")).out || null;
    const up = await git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
    info.upstream = up.ok ? up.out : null;
    const remote = await git("remote", "get-url", "origin");
    info.remote = remote.ok ? remote.out : null;
    info.dirty = !!(await git("status", "--porcelain", "--untracked-files=no")).out;
    return info;
}

async function updaterCheck() {
    const info = await updaterInfo();
    if (!info.git || !info.upstream) return { ...info, updates: [] };
    const f = await git("fetch", "--quiet");
    if (!f.ok) return { ...info, updates: [], error: "git fetch failed: " + f.err };
    const l = await git("log", "--format=%h\x1f%an\x1f%ar\x1f%s", "HEAD..@{u}");
    const updates = l.out ? l.out.split("\n").map(line => {
        const [hash, author, when, message] = line.split("\x1f");
        return { hash, author, when, message };
    }) : [];
    return { ...info, updates };
}

/* ------------------------------------------------------------------ IPC */

const sendAll = (channel, ...args) => {
    for (const wc of electron.webContents.getAllWebContents())
        if (!wc.isDestroyed()) wc.send(channel, ...args);
};
const winOf = e => ElectronBrowserWindow.fromWebContents(e.sender);

ipcMain.on("obsid:get-renderer", e => { e.returnValue = buildRendererScripts(); });
ipcMain.on("obsid:get-settings", e => { e.returnValue = readSettings(); });
ipcMain.on("obsid:get-quickcss", e => { e.returnValue = readText(QUICKCSS_FILE); });
ipcMain.on("obsid:get-themes", e => { e.returnValue = listThemes(); });
ipcMain.on("obsid:get-info", e => {
    e.returnValue = {
        version: VERSION, root: ROOT, dataDir: DATA_DIR, pluginsDir: USER_PLUGINS_DIR, themesDir: THEMES_DIR,
        electron: process.versions.electron, chrome: process.versions.chrome, discord: app.getVersion(),
    };
});

ipcMain.handle("obsid:set-settings", (_, s) => writeAtomic(SETTINGS_FILE, JSON.stringify(s, null, 4)));
ipcMain.handle("obsid:set-quickcss", (_, css) => {
    ignoreWatch.add(QUICKCSS_FILE);
    writeAtomic(QUICKCSS_FILE, String(css));
});
ipcMain.handle("obsid:open-path", (_, which) => {
    const dirs = { data: DATA_DIR, plugins: USER_PLUGINS_DIR, themes: THEMES_DIR, root: ROOT };
    if (which === "quickcss") return shell.openPath(QUICKCSS_FILE);
    return shell.openPath(dirs[which] || DATA_DIR);
});
ipcMain.handle("obsid:open-url", (_, url) => {
    if (/^https:\/\//.test(String(url))) return shell.openExternal(String(url));
});
ipcMain.handle("obsid:toggle-devtools", e => e.sender.toggleDevTools());
ipcMain.handle("obsid:relaunch", () => { app.relaunch(); app.exit(0); });

ipcMain.handle("obsid:write-theme", (_, file, css) => {
    writeAtomic(path.join(THEMES_DIR, safeName(file, ".css")), String(css));
});
ipcMain.handle("obsid:trash-theme", (_, file) => shell.trashItem(path.join(THEMES_DIR, safeName(file, ".css"))));
ipcMain.handle("obsid:fetch-theme", async (_, url) => {
    if (!/^https:\/\/\S+$/i.test(String(url))) throw new Error("Theme URLs must start with https://");
    const res = await fetch(String(url), { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 5 * 1024 * 1024) throw new Error("Theme is larger than 5 MB");
    return text;
});

/* ------------------------------------------------------- plugin import */

const MAX_PLUGIN_SIZE = 2 * 1024 * 1024;

ipcMain.handle("obsid:plugin-pick-file", async e => {
    const { canceled, filePaths } = await dialog.showOpenDialog(winOf(e), {
        title: "Import Obsid plugin",
        properties: ["openFile"],
        filters: [{ name: "JavaScript plugin", extensions: ["js"] }],
    });
    if (canceled || !filePaths?.[0]) return null;
    const stat = fs.statSync(filePaths[0]);
    if (stat.size > MAX_PLUGIN_SIZE) throw new Error("Plugin file is larger than 2 MB");
    return { fileName: path.basename(filePaths[0]), code: fs.readFileSync(filePaths[0], "utf8") };
});
ipcMain.handle("obsid:plugin-fetch", async (_, url) => {
    url = String(url).trim();
    if (!/^https:\/\/\S+$/i.test(url)) throw new Error("Plugin links must start with https://");
    // GitHub "blob" page links → raw file links
    url = url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i, "https://raw.githubusercontent.com/$1/$2/");
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const code = await res.text();
    if (code.length > MAX_PLUGIN_SIZE) throw new Error("Plugin is larger than 2 MB");
    if (/^\s*</.test(code)) throw new Error("That link returned a web page, not a .js file. Use the raw file link.");
    const fileName = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "plugin.js");
    return { fileName: fileName.endsWith(".js") ? fileName : fileName + ".js", code, url };
});
ipcMain.handle("obsid:plugin-install", (_, fileName, code) => {
    const name = safeName(String(fileName).replace(/[^\w.\-]+/g, "_"), ".js");
    const dest = path.join(USER_PLUGINS_DIR, name);
    writeAtomic(dest, String(code));
    return name;
});
ipcMain.handle("obsid:plugin-exists", (_, fileName) =>
    fs.existsSync(path.join(USER_PLUGINS_DIR, safeName(String(fileName).replace(/[^\w.\-]+/g, "_"), ".js"))));
/** Runs an installed user plugin in the page right away (no reload needed). */
ipcMain.handle("obsid:plugin-run", async (e, file) => {
    const name = safeName(file, ".js");
    const code = wrapUserPlugin(name, readText(path.join(USER_PLUGINS_DIR, name)));
    // `void 0` at the end: the script's last value (the plugin object) can't be sent back over IPC.
    await e.sender.executeJavaScript(`${code};\nvoid 0;\n//# sourceURL=obsid://user-plugins/${name}`);
});
ipcMain.handle("obsid:plugin-trash", (_, file) => shell.trashItem(path.join(USER_PLUGINS_DIR, safeName(file, ".js"))));
ipcMain.handle("obsid:plugin-read", (_, file) => readText(path.join(USER_PLUGINS_DIR, safeName(file, ".js"))));

ipcMain.handle("obsid:updater-info", () => updaterInfo());
ipcMain.handle("obsid:updater-check", () => updaterCheck());
ipcMain.handle("obsid:updater-pull", async () => {
    const r = await git("pull", "--ff-only");
    return { ok: r.ok, output: r.ok ? r.out : r.err };
});

ipcMain.handle("obsid:backup-export", async (e, data) => {
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
ipcMain.handle("obsid:backup-import", async e => {
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
/** Writes a restored backup. Settings + Quick CSS are replaced; themes are added/overwritten. */
ipcMain.handle("obsid:backup-apply", (_, data, parts) => {
    if (parts.settings && data.settings) writeAtomic(SETTINGS_FILE, JSON.stringify(data.settings, null, 4));
    if (parts.quickCss && typeof data.quickCss === "string") { ignoreWatch.add(QUICKCSS_FILE); writeAtomic(QUICKCSS_FILE, data.quickCss); }
    if (parts.themes && data.themes) {
        for (const [file, css] of Object.entries(data.themes))
            writeAtomic(path.join(THEMES_DIR, safeName(file, ".css")), String(css));
    }
});
ipcMain.handle("obsid:reset-settings", () => writeAtomic(SETTINGS_FILE, "{}"));

/* ------------------------------------------------ watch for external edits */

const ignoreWatch = new Set();
function watch(target, onChange) {
    let t;
    try {
        fs.watch(target, (_, file) => {
            clearTimeout(t);
            t = setTimeout(() => {
                const full = file && target !== QUICKCSS_FILE ? path.join(target, String(file)) : target;
                if (ignoreWatch.delete(full)) return;
                onChange();
            }, 150);
        });
    } catch (e) { log("watch failed for", target, e.message); }
}
watch(QUICKCSS_FILE, () => sendAll("obsid:quickcss-changed", readText(QUICKCSS_FILE)));
watch(THEMES_DIR, () => sendAll("obsid:themes-changed"));

/* ------------------------------------------------------- window patching */

const ORIGINAL_PRELOAD_ARG = "--obsid-original-preload=";

function shouldInject(options) {
    const preload = options?.webPreferences?.preload;
    return typeof preload === "string" && !/splash/i.test(preload);
}

class BrowserWindow extends electron.BrowserWindow {
    constructor(options = {}) {
        if (shouldInject(options)) {
            const wp = options.webPreferences;
            const original = wp.preload;
            wp.preload = PRELOAD;
            wp.sandbox = false; // our preload needs require() to chain Discord's preload
            wp.additionalArguments = [...(wp.additionalArguments || []), ORIGINAL_PRELOAD_ARG + original];
            log("Injecting into window, original preload:", original);
        }
        super(options);
    }
}

const electronPath = require.resolve("electron");
const cached = require.cache[electronPath];
if (cached) {
    delete cached.exports;
    cached.exports = { ...electron, BrowserWindow };
    log(`v${VERSION} loaded (BrowserWindow patched)`);
} else {
    // Fallback: session-wide preload. Runs alongside Discord's preload instead of wrapping it.
    app.whenReady().then(() => {
        const ses = electron.session.defaultSession;
        if (ses.registerPreloadScript)
            ses.registerPreloadScript({ type: "frame", filePath: PRELOAD });
        else
            ses.setPreloads([...ses.getPreloads(), PRELOAD]);
        log(`v${VERSION} loaded (session preload fallback)`);
    });
}
