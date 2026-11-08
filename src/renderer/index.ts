/*
 * Renderer entry. Bundled to dist/renderer.js and run in Discord's page by the preload.
 * Load order: core → built-in plugins registered → pages/UI → window.Vanta exposed.
 * The preload then runs the user's imported plugins, then calls Vanta.__boot().
 */
import "./core/net"; // install request hooks as early as possible

import { common } from "./core/common";
import { logger, makeLogger } from "./core/logger";
import { native } from "./core/native";
import { patcher } from "./core/patcher";
import { plugins, registerPlugin, removePlugin, isPluginEnabled, setPluginEnabled, startAll } from "./core/plugins";
import { net } from "./core/net";
import { quickCss } from "./core/quickCss";
import { storage } from "./core/storage";
import { settings, saveSettings } from "./core/settings";
import { onDomReady, sleep, managedStyle } from "./core/utils";
import { webpack } from "./core/webpack";
import { themes } from "./themes";
import { pluginStore } from "./pluginStore";
import { ui } from "./ui/components";

import "./pages/vanta";
import "./pages/plugins";
import "./pages/store";
import "./pages/themes";
import "./pages/updater";
import { startAutoUpdate, checkForUpdates } from "./autoUpdate";
import "./pages/cloud";
import "./pages/backup";
import { settingsSidebar } from "./settingsSidebar";
import { quickPanel } from "./quickPanel";
import { inSafeMode, showSafeModeNotice } from "./safeMode";
import { startWindowControls } from "./windowControls";
import { startupPluginUpdateCheck } from "./pluginUpdates";

import builtinPlugins from "~plugins";

const w = window as any;
if (w.Vanta) {
    logger.warn("Vanta is already loaded; skipping");
} else {
    for (const p of builtinPlugins.flat()) {
        try { registerPlugin(p); } catch (e) { logger.error("Bad plugin", p?.name, e); }
    }

    let booted = false;
    w.Vanta = {
        version: __VANTA_VERSION__,
        native, logger, makeLogger,
        settings, saveSettings,
        webpack, patcher, net, common, quickCss, themes, pluginStore, storage,
        utils: { onDomReady, sleep, managedStyle },
        plugins,
        /** For imported .js plugins: Vanta.definePlugin({...}) registers immediately. */
        definePlugin: registerPlugin,
        removePlugin, isPluginEnabled, setPluginEnabled, checkForUpdates,
        ui: { ...ui, open: quickPanel.show, close: quickPanel.hide, settingsSidebar },
        __currentFile: null as string | null,
        /** Called by the preload after imported plugins have loaded. */
        __boot() {
            if (booted) return;
            booted = true;
            startWindowControls();
            startAll();
            webpack.ready.then(() => {
                // Reaching here means Discord loaded fine: reset crash detection (after a short grace period).
                setTimeout(() => native.bootOk(), 8000);
                if (inSafeMode()) { showSafeModeNotice(); return; }
                if (settings.vanta.startupToast)
                    ui.toast(`Vanta ${__VANTA_VERSION__} loaded${settings.vanta.quickPanel ? " · Ctrl+Shift+O for settings" : ""}`);
                startAutoUpdate();
                if (settings.vanta.autoCheckUpdates) setTimeout(startupPluginUpdateCheck, 20000);
            });
        },
    };
    // Vanta used to be called Obsid; plugins written as Obsid.definePlugin(...) keep working.
    w.Obsid = w.Vanta;
    quickCss.apply();
    logger.log(`v${__VANTA_VERSION__} loaded`);
}
