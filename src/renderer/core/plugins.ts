import { makeLogger, logger, type Logger } from "./logger";
import { settings, saveSettings, type PluginSettings } from "./settings";
import { ready as webpackReady } from "./webpack";
import { onDomReady } from "./utils";
import { native } from "./native";

export type OptionType = "boolean" | "string" | "number" | "text" | "select";

export interface PluginOption {
    type: OptionType;
    default: any;
    label?: string;
    description?: string;
    placeholder?: string;
    /** for type "select" */
    options?: { value: string; label: string }[];
}

export interface PluginDef {
    name: string;
    description?: string;
    authors?: string[];
    category?: string;
    /** Vanta version the plugin was added in; shows a "New" tag during that version */
    since?: string;
    enabledByDefault?: boolean;
    /** Wait for Discord's modules before start() */
    needsWebpack?: boolean;
    /** Toggling needs a reload instead of start()/stop() */
    restartNeeded?: boolean;
    options?: Record<string, PluginOption>;
    start?(): void | Promise<void>;
    stop?(): void | Promise<void>;
    onSettingChange?(key: string, value: unknown): void;
    /** Extra UI shown in the plugin's Settings pop-up */
    settingsPanel?(): Node;
    [key: string]: any;
}

export interface PluginInstance extends PluginDef {
    started: boolean;
    error: string | null;
    /** set for plugins the user imported */
    file: string | null;
    logger: Logger;
    readonly settings: Record<string, any>;
}

/**
 * Typed helper for writing plugins. Inside the object, `this` has `settings`, `logger`, `started`.
 *   export default definePlugin({ name: "Foo", start() { this.logger.log("hi"); } });
 */
export function definePlugin<T extends PluginDef>(plugin: T & ThisType<T & PluginInstance>): T {
    return plugin;
}

/**
 * A plugin that's only CSS. Costs nothing while running: one <style> tag, rebuilt when options change.
 *   export default cssPlugin({ name, description, options, css: s => `...${s.color}...` });
 */
export function cssPlugin(def: PluginDef & { css: string | ((settings: Record<string, any>) => string) }): PluginDef {
    const id = "vanta-css-" + def.name.replace(/\W+/g, "-").toLowerCase();
    const render = (self: PluginInstance) => typeof def.css === "function" ? def.css(self.settings) : def.css;
    let el: HTMLStyleElement | null = null;
    // Plugins can start before the page has a <head> (right after a reload), so wait for it.
    const apply = (self: PluginInstance) => onDomReady(() => {
        if (!self.started && el === null && !isPluginEnabled(self.name)) return; // stopped meanwhile
        el ??= document.head.appendChild(Object.assign(document.createElement("style"), { id }));
        el.textContent = render(self);
    });
    return {
        ...def,
        start() { apply(this as PluginInstance); },
        stop() { el?.remove(); el = null; },
        onSettingChange() { if ((this as PluginInstance).started) apply(this as PluginInstance); },
    };
}

export const plugins = new Map<string, PluginInstance>();
let booted = false;

const pluginSettings = (name: string): PluginSettings =>
    (settings.plugins[name] ??= { enabled: false, options: {} });

export const isPluginEnabled = (name: string) => !!settings.plugins[name]?.enabled;

/** Registers a plugin. Re-registering a user plugin from the same file replaces it (= update). */
export function registerPlugin(def: PluginDef): PluginInstance {
    if (!def?.name) throw new Error("Plugin needs a name");
    const p = def as PluginInstance;
    p.file = (window as any).Vanta?.__currentFile ?? null;
    const existing = plugins.get(p.name);
    if (existing) {
        if (p.file && existing.file === p.file) {
            stopPlugin(existing);
            plugins.delete(p.name);
        } else {
            logger.warn(`Duplicate plugin ${p.name} ignored`);
            return existing;
        }
    }
    const s = settings.plugins[p.name] ??= { enabled: !!p.enabledByDefault, options: {} };
    s.options ??= {};
    for (const [key, opt] of Object.entries(p.options || {}))
        if (!(key in s.options)) s.options[key] = opt.default;
    p.started = false;
    p.error = null;
    p.logger = makeLogger(p.name);
    Object.defineProperty(p, "settings", { configurable: true, get: () => pluginSettings(p.name).options });
    plugins.set(p.name, p);
    if (booted) { saveSettings(); if (s.enabled) startPlugin(p); }
    window.dispatchEvent(new CustomEvent("vanta:plugins"));
    return p;
}

/**
 * Starts a plugin. Plugins that use Discord's internals are retried for ~20s if they fail:
 * right after a reload, many of Discord's stores load a few seconds after the core ones, and a
 * plugin that looks one up too early would otherwise be stuck showing an error.
 */
export async function startPlugin(p: PluginInstance) {
    if (p.started) return true;
    if (native.info.safeMode) return false; // safe mode: nothing runs
    if (p.needsWebpack) await webpackReady;
    const delays = p.needsWebpack ? [1000, 2000, 3000, 4000, 5000, 5000] : [];
    for (let attempt = 0; ; attempt++) {
        if (!isPluginEnabled(p.name) && attempt > 0) return false; // turned off meanwhile
        try {
            await p.start?.();
            p.started = true;
            p.error = null;
            logger.log(`Started ${p.name}${attempt ? ` (after ${attempt} retr${attempt === 1 ? "y" : "ies"})` : ""}`);
            break;
        } catch (e: any) {
            try { await p.stop?.(); } catch { } // undo anything half-started
            if (attempt >= delays.length) {
                p.error = String(e?.message || e);
                logger.error(`Failed to start ${p.name}:`, e);
                break;
            }
            await new Promise(r => setTimeout(r, delays[attempt]));
        }
    }
    window.dispatchEvent(new CustomEvent("vanta:plugins"));
    return p.started;
}

export async function stopPlugin(p: PluginInstance) {
    if (!p.started) return true;
    try { await p.stop?.(); p.started = false; logger.log(`Stopped ${p.name}`); }
    catch (e) { logger.error(`Failed to stop ${p.name}:`, e); }
    return !p.started;
}

export async function setPluginEnabled(name: string, enabled: boolean) {
    const p = plugins.get(name);
    if (!p) return;
    pluginSettings(name).enabled = enabled;
    saveSettings();
    if (!p.restartNeeded) await (enabled ? startPlugin(p) : stopPlugin(p));
}

/** Stops and forgets a plugin (used when deleting an imported plugin). */
export async function removePlugin(name: string) {
    const p = plugins.get(name);
    if (!p) return;
    await stopPlugin(p);
    plugins.delete(name);
    delete settings.plugins[name];
    saveSettings();
    window.dispatchEvent(new CustomEvent("vanta:plugins"));
}

export function startAll() {
    booted = true;
    saveSettings();
    for (const p of plugins.values()) if (pluginSettings(p.name).enabled) startPlugin(p);
}
