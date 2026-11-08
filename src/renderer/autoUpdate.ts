/*
 * Automatic updates: check on startup and every few hours; if there's an update, install it,
 * restart Discord (waiting until you're out of a voice call), and afterwards show
 * "Obsid has been updated to version x.x.x".
 */
import { common } from "./core/common";
import { logger } from "./core/logger";
import { native, cleanError } from "./core/native";
import { settings, saveSettings, saveSettingsNow } from "./core/settings";
import { sleep } from "./core/utils";
import { ui, h } from "./ui/components";

const CHECK_EVERY = 4 * 60 * 60 * 1000;
let running = false;

const inVoiceCall = () => !!common.SelectedChannelStore?.getVoiceChannelId?.();

/** Shown once after Discord restarts from an automatic update. */
export function showUpdatedNotice() {
    const p = settings.obsid.pendingUpdate;
    if (!p) return;
    settings.obsid.pendingUpdate = null;
    saveSettings();
    // Ignore stale notices (e.g. Discord was killed before restarting)
    if (Date.now() - p.at > 24 * 60 * 60 * 1000) return;
    ui.modal({
        title: `Obsid has been updated to version ${p.to}`,
        body: [
            h("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
                ui.logo(48),
                h("div", {},
                    h("div", { class: "obsid-row-title" }, `Updated from ${p.from} to ${p.to}`),
                    h("div", { class: "obsid-row-desc" }, "Discord was restarted to finish the update."))),
            p.notes ? ui.section("What's new", ui.card({ class: "obsid-pad", style: { whiteSpace: "pre-wrap", fontSize: "14px", lineHeight: "20px", maxHeight: "300px", overflow: "auto" } }, p.notes)) : null,
        ],
        buttons: [
            { text: "Updater settings", variant: "ghost", onClick: () => { (window as any).Obsid?.ui?.open?.("updater"); } },
            { text: "Nice", variant: "primary" },
        ],
    });
}

async function restartWhenIdle(version: string) {
    if (inVoiceCall()) {
        ui.toast(`Obsid ${version} is installed. Discord will restart when you leave the voice call.`, { ms: 8000 });
        while (inVoiceCall()) await sleep(15000);
    }
    let cancelled = false;
    const t = ui.modal({
        title: "Restarting Discord to finish the update",
        body: h("div", {}, `Obsid ${version} is installed. Discord restarts in 10 seconds.`),
        buttons: [
            { text: "Later", variant: "ghost", onClick: () => { cancelled = true; } },
            { text: "Restart now", variant: "primary" },
        ],
    });
    for (let i = 0; i < 100 && !cancelled && document.querySelector(".obsid-modal-back"); i++) await sleep(100);
    if (cancelled) {
        ui.toast("Update installed. It'll apply the next time Discord restarts.", { ms: 6000 });
        return;
    }
    t.close();
    await saveSettingsNow();
    native.relaunch();
}

/** Checks for an update; installs it and restarts Discord if auto-update is on. */
export async function checkForUpdates({ manual = false } = {}) {
    if (running) return;
    running = true;
    try {
        const r = await native.updaterCheck();
        const has = !!(r.release || r.updates?.length);
        if (!has) { if (manual) ui.toast("Obsid is up to date."); return; }
        const label = r.release ? r.release.tag.replace(/^v/i, "") : `${r.updates.length} new commit${r.updates.length > 1 ? "s" : ""}`;
        if (!settings.obsid.autoUpdate && !manual) {
            ui.toast(`Obsid update available (${label}). Open Settings › Updater.`, { ms: 7000 });
            return;
        }
        ui.toast(`Updating Obsid (${label})…`);
        const res = await native.updaterApply();
        if (!res.ok) { ui.toast("Obsid update failed: " + res.output, { type: "danger", ms: 8000 }); return; }
        const to = res.version || label;
        const notes = r.release?.notes || r.updates?.map(u => `• ${u.message}`).join("\n") || "";
        settings.obsid.pendingUpdate = { from: native.info.version, to, notes, at: Date.now() };
        await saveSettingsNow();
        await restartWhenIdle(to);
    } catch (e) {
        logger.error("Update check failed", e);
        if (manual) ui.toast("Couldn't check for updates: " + cleanError(e), { type: "danger" });
    } finally {
        running = false;
    }
}

/** Startup: show the "updated" notice, then check now and every few hours. */
export function startAutoUpdate() {
    showUpdatedNotice();
    if (!settings.obsid.autoCheckUpdates) return;
    setTimeout(() => checkForUpdates(), 8000);
    setInterval(() => { if (settings.obsid.autoCheckUpdates) checkForUpdates(); }, CHECK_EVERY);
}
