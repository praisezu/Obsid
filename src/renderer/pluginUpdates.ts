/* Checks installed (imported) plugins for updates: store plugins by checksum, link plugins by content. */
import type { FetchedPlugin, StorePlugin } from "@shared/types";
import { logger } from "./core/logger";
import { native, cleanError } from "./core/native";
import { plugins } from "./core/plugins";
import { settings, saveSettings } from "./core/settings";
import { install } from "./pluginStore";
import { ui } from "./ui/components";

export interface PluginUpdate {
    file: string;
    name: string;
    kind: "store" | "link";
    store?: StorePlugin;
    data?: FetchedPlugin;
}

let last: { at: number; updates: PluginUpdate[] } | null = null;

const nameOf = (file: string) => [...plugins.values()].find(p => p.file === file)?.name ?? file.replace(/\.js$/, "");

export async function checkPluginUpdates(force = false): Promise<PluginUpdate[]> {
    if (!force && last && Date.now() - last.at < 10 * 60 * 1000) return last.updates;
    const updates: PluginUpdate[] = [];
    const installedFiles = new Set([...plugins.values()].map(p => p.file).filter(Boolean));

    const fromStore = Object.entries(settings.storeInstalled ?? {}).filter(([file]) => installedFiles.has(file));
    if (fromStore.length) {
        try {
            const idx = await native.storeIndex(force);
            for (const [file, info] of fromStore) {
                const entry = idx.plugins.find(p => p.path === info.path);
                if (entry && entry.sha256 !== info.sha256) updates.push({ file, name: nameOf(file), kind: "store", store: entry });
            }
        } catch (e) { logger.warn("Store update check failed", e); }
    }

    for (const [file, url] of Object.entries(settings.pluginSources ?? {})) {
        if (!installedFiles.has(file) || settings.storeInstalled?.[file]) continue;
        try {
            const data = await native.pluginFetch(url);
            if (data.code !== await native.pluginRead(file)) updates.push({ file, name: nameOf(file), kind: "link", data });
        } catch (e) { logger.warn(`Update check failed for ${file}`, e); }
    }
    last = { at: Date.now(), updates };
    window.dispatchEvent(new CustomEvent("vanta:plugin-updates"));
    return updates;
}

export const knownUpdates = () => last?.updates ?? [];

/** Installs one update (shows the code review first). Returns true if it was installed. */
export async function applyUpdate(u: PluginUpdate) {
    try {
        const data = u.kind === "store" ? await native.storeDownload(u.store!.path, u.store!.sha256) : u.data!;
        const file = await install(data, { fileName: u.file });
        if (!file) return false;
        if (u.kind === "store") { (settings.storeInstalled ??= {})[file] = { path: u.store!.path, sha256: u.store!.sha256 }; saveSettings(); }
        if (last) last.updates = last.updates.filter(x => x.file !== u.file);
        window.dispatchEvent(new CustomEvent("vanta:plugin-updates"));
        return true;
    } catch (e) {
        ui.toast(`Couldn't update ${u.name}: ${cleanError(e)}`, { type: "danger", ms: 7000 });
        return false;
    }
}

export async function updateAll() {
    let n = 0;
    for (const u of [...knownUpdates()]) if (await applyUpdate(u)) n++;
    if (n) ui.toast(`Updated ${n} plugin${n === 1 ? "" : "s"}`, { type: "ok" });
}

/** Startup check: just a toast; nothing installs without the user. */
export async function startupPluginUpdateCheck() {
    const u = await checkPluginUpdates(true);
    if (u.length) ui.toast(`${u.length} plugin update${u.length === 1 ? "" : "s"} available · Settings › Plugins`, { ms: 7000 });
}
