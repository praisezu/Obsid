import type { BackupData, BackupParts } from "@shared/types";
import { native, cleanError } from "../core/native";
import { settings } from "../core/settings";
import { quickCss } from "../core/quickCss";
import { themes } from "../themes";
import { ui, h } from "../ui/components";

const PARTS: [keyof BackupParts, string, string][] = [
    ["settings", "Settings & plugin config", "Which plugins are on, their options, Obsid settings and online themes."],
    ["quickCss", "Quick CSS", "Your Quick CSS editor contents."],
    ["themes", "Local theme files", "The .css files in your themes folder."],
];

function partRows(parts: BackupParts, available?: BackupParts) {
    return ui.card({ class: "obsid-rows" },
        PARTS.filter(([k]) => !available || available[k]).map(([key, title, desc]) => ui.row({
            title, description: desc,
            control: ui.switch({ checked: parts[key], label: title, onChange: v => { parts[key] = v; } }),
        })));
}

function showRestore(data: BackupData) {
    const available: BackupParts = {
        settings: !!data.settings,
        quickCss: typeof data.quickCss === "string",
        themes: !!data.themes && Object.keys(data.themes).length > 0,
    };
    if (!Object.values(available).some(Boolean)) { ui.toast("That backup is empty.", { type: "danger" }); return; }
    const parts = { ...available };
    const created = data.created ? new Date(data.created).toLocaleString() : "unknown date";
    ui.modal({
        title: "Restore backup",
        body: [
            h("div", {}, `Made with Obsid ${data.version || "?"} on ${created}. Pick what to restore:`),
            partRows(parts, available),
            ui.note("warn", "Restoring replaces your current settings and Quick CSS. Theme files with the same name are overwritten. Discord reloads afterwards."),
        ],
        buttons: [
            { text: "Cancel", variant: "ghost" },
            {
                text: "Restore and reload", variant: "primary",
                onClick: async () => {
                    try { await native.backupApply(data, parts); location.reload(); }
                    catch (e) { ui.toast("Restore failed: " + cleanError(e), { type: "danger" }); return false; }
                },
            },
        ],
    });
}

ui.registerPage({
    id: "backup",
    label: "Backup & Restore",
    icon: "backup",
    order: 5,
    keywords: ["export", "import", "reset"],
    render(ctx) {
        const parts = (ctx.state.parts ??= { settings: true, quickCss: true, themes: true }) as BackupParts;

        return h("div", { class: "obsid-page" },
            ui.pageHead("Backup & Restore", "Export everything to one file, bring it back later or on another computer."),

            ui.section("Export",
                h("div", { class: "obsid-row-desc" }, "Save your Obsid setup to a file you can keep or move to another PC."),
                partRows(parts),
                h("div", { class: "obsid-btns" },
                    ui.button("Export backup", {
                        variant: "primary", icon: "upload",
                        onClick: async () => {
                            const data: BackupData = { obsidBackup: 1, version: native.info.version, created: new Date().toISOString() };
                            if (parts.settings) data.settings = JSON.parse(JSON.stringify(settings));
                            if (parts.quickCss) data.quickCss = quickCss.css;
                            if (parts.themes) data.themes = Object.fromEntries(themes.local.map(t => [t.file, t.css]));
                            try {
                                const file = await native.backupExport(data);
                                if (file) ui.toast("Backup saved to " + file, { type: "ok", ms: 6000 });
                            } catch (e) { ui.toast("Export failed: " + cleanError(e), { type: "danger" }); }
                        },
                    })),
            ),

            ui.section("Restore",
                h("div", { class: "obsid-row-desc" }, "Load a backup file. You'll see what's in it before anything changes."),
                h("div", { class: "obsid-btns" },
                    ui.button("Choose backup file…", {
                        icon: "download",
                        onClick: async () => {
                            try { const data = await native.backupImport(); if (data) showRestore(data); }
                            catch (e) { ui.toast(cleanError(e), { type: "danger" }); }
                        },
                    })),
            ),

            ui.section("Danger zone",
                ui.card({ class: "obsid-rows" },
                    ui.row({
                        title: "Reset Obsid settings",
                        description: "Turns every plugin back to its default and clears plugin options. Themes and Quick CSS files are kept.",
                        control: ui.button("Reset", {
                            variant: "danger", onClick: async () => {
                                const ok = await ui.confirm({ title: "Reset all settings?", danger: true, confirmText: "Reset and reload", body: "This can't be undone unless you exported a backup first." });
                                if (!ok) return;
                                await native.resetSettings();
                                location.reload();
                            },
                        }),
                    }))),
        );
    },
});
