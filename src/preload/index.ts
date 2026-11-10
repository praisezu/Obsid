/*
 * Vanta — preload. Exposes window.VantaNative, runs Vanta in the page's main world,
 * then loads Discord's own preload.
 */
import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { NativeAPI, RendererScript } from "@shared/types";

const invoke = (ch: string, ...a: unknown[]) => ipcRenderer.invoke("vanta:" + ch, ...a);

const native: NativeAPI = {
    info: ipcRenderer.sendSync("vanta:get-info"),
    getSettings: () => ipcRenderer.sendSync("vanta:get-settings"),
    setSettings: s => invoke("set-settings", s),
    resetSettings: () => invoke("reset-settings"),
    getQuickCss: () => ipcRenderer.sendSync("vanta:get-quickcss"),
    setQuickCss: css => invoke("set-quickcss", css),
    onQuickCssChange: cb => { ipcRenderer.on("vanta:quickcss-changed", (_, css) => cb(css)); },

    getThemes: () => ipcRenderer.sendSync("vanta:get-themes"),
    onThemesChange: cb => { ipcRenderer.on("vanta:themes-changed", () => cb()); },
    writeTheme: (file, css) => invoke("write-theme", file, css),
    trashTheme: file => invoke("trash-theme", file),
    fetchTheme: url => invoke("fetch-theme", url),

    fetchText: url => invoke("fetch-text", url),
    aiHasKey: () => invoke("ai-has-key"),
    aiKeys: () => invoke("ai-keys"),
    aiSetKey: key => invoke("ai-set-key", key),
    aiChat: (system, messages, maxTokens) => invoke("ai-chat", system, messages, maxTokens),
    voiceSpeak: (text, speed) => invoke("voice-speak", text, speed),
    voiceStatus: () => invoke("voice-status"),
    voiceWarm: () => invoke("voice-warm"),
    saveFiles: files => invoke("save-files", files),
    muteOverlay: (state, corner) => invoke("mute-overlay", state, corner),
    openAppUrl: url => invoke("open-app-url", url),
    bdThemes: force => invoke("bd-themes", force),
    bdInstallTheme: id => invoke("bd-install-theme", id),
    storeIndex: force => invoke("store-index", force),
    storeDownload: (p, sha) => invoke("store-download", p, sha),

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
    bootOk: () => invoke("boot-ok"),
    setSafeMode: on => invoke("set-safe-mode", on),
    cloudStatus: () => invoke("cloud-status"),
    cloudSignIn: token => invoke("cloud-sign-in", token),
    cloudSignOut: () => invoke("cloud-sign-out"),
    cloudPush: data => invoke("cloud-push", data),
    cloudPull: () => invoke("cloud-pull"),
    cloudRemoteUpdated: () => invoke("cloud-remote-updated"),
    dataGet: key => invoke("data-get", key),
    dataSet: (key, value) => invoke("data-set", key, value),
} as NativeAPI;

if (process.contextIsolated) contextBridge.exposeInMainWorld("VantaNative", native);
else (window as any).VantaNative = native;

// Only run inside Discord's web app (not devtools or other origins).
if (/^https:\/\/(\w+\.)?discord\.com/.test(location.href)) {
    (async () => {
        const scripts: RendererScript[] = ipcRenderer.sendSync("vanta:get-renderer");
        for (const { name, code } of scripts) {
            try {
                // `void 0`: keep the last expression's value from being cloned back.
                await webFrame.executeJavaScript(`${code};\nvoid 0;\n//# sourceURL=vanta://${name}`);
            } catch (e) {
                console.error(`[Vanta] Failed to run ${name}:`, e);
            }
        }
    })();
}

const PREFIX = "--vanta-original-preload=";
const original = process.argv.find(a => a.startsWith(PREFIX));
if (original) require(original.slice(PREFIX.length));
