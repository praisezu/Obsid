/* Safe mode: the notice shown when it's on, and the buttons to enter/leave it. */
import { native } from "./core/native";
import { plugins } from "./core/plugins";
import { settings, saveSettingsNow } from "./core/settings";
import { ui, h } from "./ui/components";

export const inSafeMode = () => native.info.safeMode;

export async function restartInSafeMode() {
    await native.setSafeMode(true);
    native.relaunch();
}

export async function leaveSafeMode({ disableAll = false } = {}) {
    if (disableAll) {
        for (const p of plugins.values()) if (settings.plugins[p.name]) settings.plugins[p.name].enabled = false;
        settings.themes.enabled = [];
        for (const o of settings.themes.online) o.enabled = false;
        await saveSettingsNow();
    }
    await native.setSafeMode(false);
    native.relaunch();
}

const why = () => native.info.safeModeReason === "crash"
    ? "Discord didn't finish starting twice in a row, so Vanta started without plugins, themes or Quick CSS. One of them is probably the cause."
    : "You restarted Discord in safe mode. Plugins, themes and Quick CSS are off.";

/** Card for the Vanta settings page. */
export function safeModeCard() {
    return ui.note("danger",
        h("div", { style: { fontWeight: "700", marginBottom: "4px" } }, "Safe mode is on"),
        h("div", {}, why()),
        h("div", { class: "vanta-btns", style: { marginTop: "10px" } },
            ui.button("Restart normally", { variant: "primary", icon: "power", onClick: () => leaveSafeMode() }),
            ui.button("Turn everything off, then restart", { icon: "power", onClick: () => leaveSafeMode({ disableAll: true }) }),
        ));
}

/** Pop-up shown once per launch while in safe mode. */
export function showSafeModeNotice() {
    ui.modal({
        title: "Vanta is in safe mode",
        body: [
            h("div", {}, why()),
            h("div", { class: "vanta-row-desc" }, "Turn off whatever caused the problem in Settings → Vanta Settings, then restart normally. Or turn everything off and add things back one at a time."),
        ],
        buttons: [
            { text: "Stay in safe mode", variant: "ghost" },
            { text: "Turn everything off & restart", variant: "ghost", onClick: () => leaveSafeMode({ disableAll: true }) },
            { text: "Restart normally", variant: "primary", onClick: () => leaveSafeMode() },
        ],
    });
}
