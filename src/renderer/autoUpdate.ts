/*
 * Automatic updates: check on startup and every few hours; if there's an update, install it,
 * restart Discord (waiting until you're out of a voice call), and afterwards show
 * "Vanta has been updated to version x.x.x".
 */
import { common } from "./core/common";
import { logger } from "./core/logger";
import { native, cleanError } from "./core/native";
import { settings, saveSettings, saveSettingsNow } from "./core/settings";
import { sleep } from "./core/utils";
import { ui, h } from "./ui/components";

const CHECK_EVERY = 30 * 60 * 1000;
const WATCH_EVERY = 60 * 1000;
let running = false;
let finishing = false;
/** A version you said "Later" to: not asked again this session */
let postponed: string | null = null;

const inVoiceCall = () => !!common.SelectedChannelStore?.getVoiceChannelId?.();

/** Shown once after Discord restarts from an automatic update. */
export function showUpdatedNotice() {
    const p = settings.vanta.pendingUpdate;
    if (!p) return;
    settings.vanta.pendingUpdate = null;
    saveSettings();
    // Ignore stale notices (e.g. Discord was killed before restarting)
    if (Date.now() - p.at > 24 * 60 * 60 * 1000) return;
    ui.modal({
        title: `Vanta has been updated to version ${p.to}`,
        body: [
            h("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
                ui.logo(48),
                h("div", {},
                    h("div", { class: "vanta-row-title" }, `Updated from ${p.from} to ${p.to}`),
                    h("div", { class: "vanta-row-desc" }, p.refreshed ? "Discord was refreshed to finish the update." : "Discord was restarted to finish the update."))),
            p.notes ? ui.section("What's new", ui.card({ class: "vanta-pad", style: { whiteSpace: "pre-wrap", fontSize: "14px", lineHeight: "20px", maxHeight: "300px", overflow: "auto" } }, p.notes)) : null,
        ],
        buttons: [
            { text: "Updater settings", variant: "ghost", onClick: () => { (window as any).Vanta?.ui?.open?.("updater"); } },
            { text: "Nice", variant: "primary" },
        ],
    });
}

/**
 * Finishes an update: a quick refresh of Discord when only Vanta's in-Discord part changed (most updates), or a full
 * restart when its background part changed too. Never in the middle of a voice call.
 */
async function finishWhenIdle(version: string, restart: boolean) {
    if (finishing) return;
    finishing = true;
    try { await finishPrompt(version, restart); } finally { finishing = false; }
}

async function finishPrompt(version: string, restart: boolean) {
    const verb = restart ? "restart" : "refresh";
    if (inVoiceCall()) {
        ui.toast(`Vanta ${version} is installed. Discord will ${verb} when you leave the voice call.`, { ms: 8000 });
        while (inVoiceCall()) await sleep(15000);
    }
    let cancelled = false;
    const left = h("span", {}, "5");
    const t = ui.modal({
        title: `Vanta ${version} is ready`,
        body: h("div", {}, `Discord will ${verb} in `, left, ` seconds to finish the update.`),
        buttons: [
            { text: "Later", variant: "ghost", onClick: () => { cancelled = true; } },
            { text: restart ? "Restart now" : "Refresh now", variant: "primary" },
        ],
    });
    for (let i = 50; i > 0 && !cancelled && t.el.isConnected; i--) { left.textContent = String(Math.ceil(i / 10)); await sleep(100); }
    if (cancelled) {
        postponed = version;
        ui.toast(`Vanta ${version} is installed. It'll finish the next time Discord ${restart ? "restarts" : "reloads"}.`, { ms: 6000 });
        return;
    }
    t.close();
    await saveSettingsNow();
    if (restart) native.relaunch();
    else location.reload();
}

/**
 * A newer Vanta is already on disk but not running yet (an update finished while Discord stayed open, or you pressed
 * "Later", or a developer rebuilt it): refresh or restart to load it, just like after an automatic update.
 */
async function finishInstalled() {
    if (finishing || running) return false;
    const inst = await native.updaterInstalled().catch(() => null);
    if (!inst || inst.version === __VANTA_VERSION__ || inst.version === postponed) return false;
    settings.vanta.pendingUpdate ??= { from: __VANTA_VERSION__, to: inst.version, notes: "", at: Date.now(), refreshed: !inst.restart };
    await saveSettingsNow();
    await finishWhenIdle(inst.version, inst.restart);
    return true;
}

/** Checks for an update; installs it and restarts Discord if auto-update is on. */
export async function checkForUpdates({ manual = false } = {}) {
    if (running) return;
    if (await finishInstalled()) return;
    running = true;
    try {
        const r = await native.updaterCheck();
        const has = !!(r.release || r.updates?.length);
        if (!has) { if (manual) ui.toast("Vanta is up to date."); return; }
        const label = r.release ? r.release.tag.replace(/^v/i, "") : `${r.updates.length} new commit${r.updates.length > 1 ? "s" : ""}`;
        if (!settings.vanta.autoUpdate && !manual) {
            ui.toast(`Vanta update available (${label}). Open Settings › Updater.`, { ms: 7000 });
            return;
        }
        ui.toast(`Updating Vanta (${label})…`);
        const res = await native.updaterApply();
        if (!res.ok) { ui.toast("Vanta update failed: " + res.output, { type: "danger", ms: 8000 }); return; }
        const to = res.version || label;
        const notes = r.release?.notes || r.updates?.map(u => `• ${u.message}`).join("\n") || "";
        settings.vanta.pendingUpdate = { from: __VANTA_VERSION__, to, notes, at: Date.now(), refreshed: !res.restart };
        await saveSettingsNow();
        await finishWhenIdle(to, res.restart !== false);
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
    if (!settings.vanta.autoCheckUpdates) return;
    setTimeout(() => checkForUpdates(), 8000);
    setInterval(() => { if (settings.vanta.autoCheckUpdates) checkForUpdates(); }, CHECK_EVERY);
    // Cheap (two local files): catches a newer Vanta landing on disk while Discord is open
    setInterval(() => { if (settings.vanta.autoUpdate) finishInstalled(); }, WATCH_EVERY);
}
