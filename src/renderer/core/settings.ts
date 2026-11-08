import { native } from "./native";

export interface PluginSettings {
    enabled: boolean;
    options: Record<string, any>;
}

export interface Settings {
    plugins: Record<string, PluginSettings>;
    obsid: { startupToast: boolean; quickPanel: boolean; autoCheckUpdates: boolean };
    themes: { enabled: string[]; online: { url: string; enabled: boolean }[]; quickCssEnabled: boolean };
    /** file name → URL, for plugins imported from a link */
    pluginSources: Record<string, string>;
}

const raw = (native.getSettings() || {}) as Partial<Settings>;

export const settings: Settings = {
    ...raw,
    plugins: raw.plugins ?? {},
    obsid: { startupToast: true, quickPanel: true, autoCheckUpdates: true, ...raw.obsid },
    themes: { enabled: [], online: [], quickCssEnabled: true, ...raw.themes },
    pluginSources: raw.pluginSources ?? {},
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Debounced write to %APPDATA%/Obsid/settings.json */
export function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => native.setSettings(settings), 250);
}
