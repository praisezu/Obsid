/*
 * Obsid — preload. Exposes a tiny native bridge (window.ObsidNative), runs the
 * renderer scripts in the page's main world, then loads Discord's own preload.
 */
"use strict";

const { contextBridge, ipcRenderer, webFrame } = require("electron");

const invoke = (ch, ...a) => ipcRenderer.invoke("obsid:" + ch, ...a);

const native = {
    info: ipcRenderer.sendSync("obsid:get-info"),
    getSettings: () => ipcRenderer.sendSync("obsid:get-settings"),
    setSettings: s => invoke("set-settings", s),
    resetSettings: () => invoke("reset-settings"),
    getQuickCss: () => ipcRenderer.sendSync("obsid:get-quickcss"),
    setQuickCss: css => invoke("set-quickcss", css),
    onQuickCssChange: cb => { ipcRenderer.on("obsid:quickcss-changed", (_, css) => cb(css)); },

    getThemes: () => ipcRenderer.sendSync("obsid:get-themes"),
    onThemesChange: cb => { ipcRenderer.on("obsid:themes-changed", () => cb()); },
    writeTheme: (file, css) => invoke("write-theme", file, css),
    trashTheme: file => invoke("trash-theme", file),
    fetchTheme: url => invoke("fetch-theme", url),

    pluginPickFile: () => invoke("plugin-pick-file"),
    pluginFetch: url => invoke("plugin-fetch", url),
    pluginInstall: (fileName, code) => invoke("plugin-install", fileName, code),
    pluginExists: fileName => invoke("plugin-exists", fileName),
    pluginRun: file => invoke("plugin-run", file),
    pluginTrash: file => invoke("plugin-trash", file),
    pluginRead: file => invoke("plugin-read", file),

    updaterInfo: () => invoke("updater-info"),
    updaterCheck: () => invoke("updater-check"),
    updaterPull: () => invoke("updater-pull"),

    backupExport: data => invoke("backup-export", data),
    backupImport: () => invoke("backup-import"),
    backupApply: (data, parts) => invoke("backup-apply", data, parts),

    openPath: which => invoke("open-path", which),
    openUrl: url => invoke("open-url", url),
    openDataDir: () => invoke("open-path", "data"),
    openPluginsDir: () => invoke("open-path", "plugins"),
    toggleDevTools: () => invoke("toggle-devtools"),
    relaunch: () => invoke("relaunch"),
};

if (process.contextIsolated) contextBridge.exposeInMainWorld("ObsidNative", native);
else window.ObsidNative = native;

// Only run inside Discord's web app (not devtools, popouts of other origins, etc.)
if (/^https:\/\/(\w+\.)?discord\.com/.test(location.href)) {
    (async () => {
        const scripts = ipcRenderer.sendSync("obsid:get-renderer");
        for (const { name, code } of scripts) {
            try {
                await webFrame.executeJavaScript(`${code};\nvoid 0;\n//# sourceURL=obsid://${name}`);
            } catch (e) {
                console.error(`[Obsid] Failed to run ${name}:`, e);
            }
        }
    })();
}

const PREFIX = "--obsid-original-preload=";
const original = process.argv.find(a => a.startsWith(PREFIX));
if (original) require(original.slice(PREFIX.length));
