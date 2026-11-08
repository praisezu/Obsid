import { native } from "../core/native";
import { plugins } from "../core/plugins";
import { themes } from "../themes";
import { ui, h } from "../ui/components";
import { inSafeMode, safeModeCard, restartInSafeMode } from "../safeMode";

function folderRow(title: string, path: string, which: "data" | "plugins" | "themes" | "root") {
    return ui.row({
        title,
        description: h("span", { class: "vanta-code" }, path),
        control: ui.button("Open", { small: true, icon: "folder", onClick: () => native.openPath(which) }),
    });
}

ui.registerPage({
    id: "vanta",
    label: "Vanta",
    icon: "orb",
    order: 1,
    render(ctx) {
        const info = native.info;
        const all = [...plugins.values()];
        const running = all.filter(p => p.started).length;
        const errors = all.filter(p => p.error).length;

        return h("div", { class: "vanta-page" },
            inSafeMode() ? safeModeCard() : null,
            ui.card({ class: "vanta-hero" },
                ui.logo(64),
                h("div", { style: { flex: "1", minWidth: "0" } },
                    h("div", { class: "vanta-hero-title" }, "Vanta"),
                    h("div", { class: "vanta-hero-sub" }, `v${info.version}`),
                    h("div", { class: "vanta-stats" },
                        h("span", { class: "vanta-stat" }, h("b", {}, String(running)), ` of ${all.length} plugins running`),
                        h("span", { class: "vanta-stat" }, h("b", {}, String(themes.activeCount)), " themes on"),
                        errors ? h("span", { class: "vanta-stat", style: { color: "var(--o-danger)" } }, `${errors} plugin error${errors > 1 ? "s" : ""}`) : null,
                    ),
                ),
                h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                    __VANTA_WEBSITE__ ? ui.button("Website", { variant: "ghost", icon: "globe", onClick: () => native.openUrl(__VANTA_WEBSITE__) }) : null,
                    ui.button("GitHub", { variant: "ghost", icon: "globe", onClick: () => native.openUrl(`https://github.com/${info.repo}`) }),
                    __VANTA_DISCORD__ ? ui.button("Discord", { variant: "ghost", icon: "orb", onClick: () => native.openUrl(__VANTA_DISCORD__) }) : null),
            ),

            ui.section("Quick actions",
                h("div", { class: "vanta-btns" },
                    ui.button("Reload Discord", { variant: "primary", icon: "refresh", onClick: () => location.reload() }),
                    ui.button("Restart Discord", { icon: "power", onClick: () => native.relaunch() }),
                    ui.button("DevTools", { icon: "terminal", onClick: () => native.toggleDevTools() }),
                    ui.button("Edit Quick CSS", { icon: "code", onClick: () => ctx.navigate("themes", { tab: "quickcss" }) }),
                    inSafeMode() ? null : ui.button("Restart in safe mode", { icon: "warn", title: "Start Discord once without plugins, themes or Quick CSS", onClick: async () => { if (await ui.confirm({ title: "Restart in safe mode?", body: "Discord restarts with all plugins, themes and Quick CSS turned off, so you can fix whatever is causing trouble.", confirmText: "Restart in safe mode" })) restartInSafeMode(); } }),
                ),
            ),

            ui.section("General",
                ui.card({ class: "vanta-rows" },
                    ui.settingRow("startupToast", "Startup notification", "Show a small \"Vanta loaded\" message when Discord starts."),
                    ui.settingRow("quickPanel", "Quick panel shortcut", "Press Ctrl+Shift+O anywhere in Discord to open these settings in a pop-up."),
                    ui.settingRow("autoCheckUpdates", "Check for updates", "On startup and every few hours."),
                    ui.settingRow("autoUpdate", "Install updates automatically", "Download the update, restart Discord, then tell you which version you're on. Waits until you're out of a voice call."),
                ),
            ),

            ui.section("Folders",
                ui.card({ class: "vanta-rows" },
                    folderRow("Settings & data", info.dataDir, "data"),
                    folderRow("Your plugins", info.pluginsDir, "plugins"),
                    folderRow("Themes", info.themesDir, "themes"),
                    folderRow("Vanta install", info.root, "root"),
                ),
            ),
        );
    },
});
