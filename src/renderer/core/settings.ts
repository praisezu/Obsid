import { native } from "./native";

export interface PluginSettings {
    enabled: boolean;
    options: Record<string, any>;
}

export interface Settings {
    plugins: Record<string, PluginSettings>;
    vanta: {
        startupToast: boolean;
        quickPanel: boolean;
        autoCheckUpdates: boolean;
        /** Download and install updates automatically, then restart Discord */
        autoUpdate: boolean;
        /** Set right before an automatic restart; shown as "updated to x.x.x" after it */
        pendingUpdate?: { from: string; to: string; notes?: string; at: number } | null;
    };
    themes: { enabled: string[]; online: { url: string; enabled: boolean }[]; quickCssEnabled: boolean };
    /** file name → URL, for plugins imported from a link */
    pluginSources: Record<string, string>;
}

const raw = (native.getSettings() || {}) as Partial<Settings>;

export const settings: Settings = {
    ...raw,
    plugins: raw.plugins ?? {},
    // `obsid` is the old (pre-rebrand) name of this section
    vanta: { startupToast: true, quickPanel: true, autoCheckUpdates: true, autoUpdate: true, ...(raw as any).obsid, ...raw.vanta },
    themes: { enabled: [], online: [], quickCssEnabled: true, ...raw.themes },
    pluginSources: raw.pluginSources ?? {},
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Debounced write to %APPDATA%/Vanta/settings.json */
export function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => native.setSettings(settings), 250);
}

/** Writes settings right now (use before restarting Discord). */
export async function saveSettingsNow() {
    clearTimeout(saveTimer);
    await native.setSettings(settings);
}
