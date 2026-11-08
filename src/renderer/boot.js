// Runs last: every built-in and user plugin and every page has been defined by now.
(() => {
    Obsid.startAll();
    Obsid.webpack.ready.then(() => {
        if (Obsid.settings.obsid.startupToast) {
            const hint = Obsid.settings.obsid.quickPanel ? " · Ctrl+Shift+O for settings" : "";
            Obsid.ui.toast(`Obsid ${Obsid.version} loaded${hint}`);
        }
        if (Obsid.settings.obsid.autoCheckUpdates) setTimeout(() => Obsid.updater?.startupCheck(), 8000);
    });
})();
