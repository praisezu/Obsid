/*
 * Theme manager. Local themes live in %APPDATA%/Obsid/themes/*.css (BetterDiscord .theme.css files
 * work as-is). Online themes are downloaded by the main process, so Discord's CSP doesn't block them.
 */
import type { ThemeFile } from "@shared/types";
import { logger } from "./core/logger";
import { native, cleanError } from "./core/native";
import { quickCss } from "./core/quickCss";
import { settings, saveSettings } from "./core/settings";
import { onDomReady } from "./core/utils";

export function parseMeta(css: string): Record<string, string> {
    const block = String(css).match(/^\s*\/\*\*([\s\S]*?)\*\//);
    const meta: Record<string, string> = {};
    if (block) for (const m of block[1].matchAll(/@(\w+)[ \t]+([^\r\n]+)/g)) meta[m[1]] = m[2].trim();
    return meta;
}

interface OnlineState { css?: string; meta?: Record<string, string>; error?: string; loading?: boolean }

const cfg = settings.themes;
const listeners = new Set<() => void>();
// Iterate a copy: listeners often re-render, which removes themselves and adds a new one.
const emit = () => { for (const fn of [...listeners]) { try { fn(); } catch (e) { logger.error(e); } } };
const styles = new Map<string, HTMLStyleElement>();

export const themes = {
    local: [] as ThemeFile[],
    online: new Map<string, OnlineState>(),
    parseMeta,

    onChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

    refreshLocal() {
        try { this.local = native.getThemes(); }
        catch (e) { logger.error("Couldn't read themes", e); this.local = []; }
        this.apply();
        emit();
    },

    isEnabled: (file: string) => cfg.enabled.includes(file),
    setEnabled(file: string, on: boolean) {
        cfg.enabled = cfg.enabled.filter(f => f !== file);
        if (on) cfg.enabled.push(file);
        saveSettings();
        this.apply();
        emit();
    },

    async addOnline(rawUrl: string) {
        const url = String(rawUrl).trim();
        if (!/^https:\/\/\S+$/i.test(url)) throw new Error("Enter a link that starts with https://");
        if (cfg.online.some(o => o.url === url)) throw new Error("That theme is already added.");
        await this.loadOnline(url, true);
        const state = this.online.get(url)!;
        if (state.error) { this.online.delete(url); throw new Error(state.error); }
        cfg.online.push({ url, enabled: true });
        saveSettings();
        this.apply();
        emit();
    },
    removeOnline(url: string) {
        cfg.online = cfg.online.filter(o => o.url !== url);
        this.online.delete(url);
        saveSettings();
        this.apply();
        emit();
    },
    setOnlineEnabled(url: string, on: boolean) {
        const o = cfg.online.find(x => x.url === url);
        if (!o) return;
        o.enabled = on;
        saveSettings();
        if (on && !this.online.get(url)?.css) this.loadOnline(url);
        this.apply();
        emit();
    },
    async loadOnline(url: string, silent = false) {
        this.online.set(url, { loading: true });
        if (!silent) emit();
        try {
            const css = await native.fetchTheme(url);
            this.online.set(url, { css, meta: parseMeta(css) });
        } catch (e) {
            this.online.set(url, { error: cleanError(e) });
        }
        this.apply();
        emit();
    },

    setQuickCssEnabled(on: boolean) {
        cfg.quickCssEnabled = on;
        saveSettings();
        this.apply();
    },

    /** Syncs <style> tags with what's enabled. Quick CSS always goes last so it wins. */
    apply() {
        onDomReady(() => {
            const want = new Map<string, string>();
            for (const t of this.local) if (this.isEnabled(t.file)) want.set("local:" + t.file, t.css);
            for (const o of cfg.online) {
                const s = this.online.get(o.url);
                if (o.enabled && s?.css) want.set("online:" + o.url, s.css);
            }
            for (const [key, el] of styles) if (!want.has(key)) { el.remove(); styles.delete(key); }
            for (const [key, css] of want) {
                let el = styles.get(key);
                if (!el) {
                    el = document.createElement("style");
                    el.dataset.obsidTheme = key;
                    styles.set(key, el);
                }
                if (el.textContent !== css) el.textContent = css;
                document.head.append(el); // re-append keeps order stable
            }
            quickCss.apply();
            if (quickCss.el) document.head.append(quickCss.el);
        });
    },

    get activeCount() {
        return this.local.filter(t => this.isEnabled(t.file)).length + cfg.online.filter(o => o.enabled).length;
    },
};

native.onThemesChange(() => themes.refreshLocal());
themes.refreshLocal();
for (const o of cfg.online) if (o.enabled) themes.loadOnline(o.url, true);
