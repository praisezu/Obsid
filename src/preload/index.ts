/*
 * Obsid — preload. Exposes window.ObsidNative, runs Obsid in the page's main world,
 * then loads Discord's own preload.
 */
import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { NativeAPI, RendererScript } from "@shared/types";

const invoke = (ch: string, ...a: unknown[]) => ipcRenderer.invoke("obsid:" + ch, ...a);

const native: NativeAPI = {
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
    updaterApply: () => invoke("updater-apply"),

    backupExport: data => invoke("backup-export", data),
    backupImport: () => invoke("backup-import"),
    backupApply: (data, parts) => invoke("backup-apply", data, parts),

    openPath: which => invoke("open-path", which),
    openUrl: url => invoke("open-url", url),
    openDataDir: () => invoke("open-path", "data"),
    openPluginsDir: () => invoke("open-path", "plugins"),
    toggleDevTools: () => invoke("toggle-devtools"),
    relaunch: () => invoke("relaunch"),
} as NativeAPI;

if (process.contextIsolated) contextBridge.exposeInMainWorld("ObsidNative", native);
else (window as any).ObsidNative = native;

// Only run inside Discord's web app (not devtools or other origins).
if (/^https:\/\/(\w+\.)?discord\.com/.test(location.href)) {
    (async () => {
        const scripts: RendererScript[] = ipcRenderer.sendSync("obsid:get-renderer");
        for (const { name, code } of scripts) {
            try {
                // `void 0`: keep the last expression's value from being cloned back.
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
