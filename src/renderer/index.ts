/*
 * Renderer entry. Bundled to dist/renderer.js and run in Discord's page by the preload.
 * Load order: core → built-in plugins registered → pages/UI → window.Obsid exposed.
 * The preload then runs the user's imported plugins, then calls Obsid.__boot().
 */
import "./core/net"; // install request hooks as early as possible

import { common } from "./core/common";
import { logger, makeLogger } from "./core/logger";
import { native } from "./core/native";
import { patcher } from "./core/patcher";
import { plugins, registerPlugin, removePlugin, isPluginEnabled, setPluginEnabled, startAll } from "./core/plugins";
import { net } from "./core/net";
import { quickCss } from "./core/quickCss";
import { settings, saveSettings } from "./core/settings";
import { onDomReady, sleep, managedStyle } from "./core/utils";
import { webpack } from "./core/webpack";
import { themes } from "./themes";
import { pluginStore } from "./pluginStore";
import { ui } from "./ui/components";

import "./pages/obsid";
import "./pages/plugins";
import "./pages/themes";
import { startupUpdateCheck } from "./pages/updater";
import "./pages/backup";
import { settingsSidebar } from "./settingsSidebar";
import { quickPanel } from "./quickPanel";

import builtinPlugins from "~plugins";

const w = window as any;
if (w.Obsid) {
    logger.warn("Obsid is already loaded; skipping");
} else {
    for (const p of builtinPlugins) {
        try { registerPlugin(p); } catch (e) { logger.error("Bad plugin", p?.name, e); }
    }

    let booted = false;
    w.Obsid = {
        version: __OBSID_VERSION__,
        native, logger, makeLogger,
        settings, saveSettings,
        webpack, patcher, net, common, quickCss, themes, pluginStore,
        utils: { onDomReady, sleep, managedStyle },
        plugins,
        /** For imported .js plugins: Obsid.definePlugin({...}) registers immediately. */
        definePlugin: registerPlugin,
        removePlugin, isPluginEnabled, setPluginEnabled,
        ui: { ...ui, open: quickPanel.show, close: quickPanel.hide, settingsSidebar },
        __currentFile: null as string | null,
        /** Called by the preload after imported plugins have loaded. */
        __boot() {
            if (booted) return;
            booted = true;
            startAll();
            webpack.ready.then(() => {
                if (settings.obsid.startupToast)
                    ui.toast(`Obsid ${__OBSID_VERSION__} loaded${settings.obsid.quickPanel ? " · Ctrl+Shift+O for settings" : ""}`);
                if (settings.obsid.autoCheckUpdates) setTimeout(startupUpdateCheck, 8000);
            });
        },
    };
    quickCss.apply();
    logger.log(`v${__OBSID_VERSION__} loaded`);
}
