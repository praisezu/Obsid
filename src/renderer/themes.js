/*
 * Obsid — theme manager. Local themes live in %APPDATA%/Obsid/themes/*.css (BetterDiscord
 * .theme.css files work as-is). Online themes are fetched by the main process (no CSP issues).
 */
(() => {
    const { native, settings, saveSettings, utils, quickCss, logger } = Obsid;
    const cfg = settings.themes;
    cfg.quickCssEnabled ??= true;

    function parseMeta(css) {
        const block = String(css).match(/^\s*\/\*\*([\s\S]*?)\*\//);
        const meta = {};
        if (block) for (const m of block[1].matchAll(/@(\w+)[ \t]+([^\r\n]+)/g)) meta[m[1]] = m[2].trim();
        return meta;
    }

    const listeners = new Set();
    // Iterate a copy: listeners often re-render, which removes themselves and adds a new one.
    const emit = () => { for (const fn of [...listeners]) { try { fn(); } catch (e) { logger.error(e); } } };
    const styles = new Map(); // key -> <style>

    const themes = {
        local: [],
        online: new Map(), // url -> { css, meta, error, loading }
        parseMeta,
        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

        refreshLocal() {
            try { this.local = native.getThemes(); }
            catch (e) { logger.error("Couldn't read themes", e); this.local = []; }
            this.apply();
            emit();
        },

        isEnabled: file => cfg.enabled.includes(file),
        setEnabled(file, on) {
            cfg.enabled = cfg.enabled.filter(f => f !== file);
            if (on) cfg.enabled.push(file);
            saveSettings();
            this.apply();
            emit();
        },

        async addOnline(url) {
            url = String(url).trim();
            if (!/^https:\/\/\S+$/i.test(url)) throw new Error("Enter a link that starts with https://");
            if (cfg.online.some(o => o.url === url)) throw new Error("That theme is already added.");
            await this.loadOnline(url, true);
            const state = this.online.get(url);
            if (state.error) { this.online.delete(url); throw new Error(state.error); }
            cfg.online.push({ url, enabled: true });
            saveSettings();
            this.apply();
            emit();
        },
        removeOnline(url) {
            cfg.online = cfg.online.filter(o => o.url !== url);
            this.online.delete(url);
            saveSettings();
            this.apply();
            emit();
        },
        setOnlineEnabled(url, on) {
            const o = cfg.online.find(x => x.url === url);
            if (!o) return;
            o.enabled = on;
            saveSettings();
            if (on && !this.online.get(url)?.css) this.loadOnline(url);
            this.apply();
            emit();
        },
        async loadOnline(url, silent) {
            this.online.set(url, { loading: true });
            if (!silent) emit();
            try {
                const css = await native.fetchTheme(url);
                this.online.set(url, { css, meta: parseMeta(css) });
            } catch (e) {
                this.online.set(url, { error: String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "") });
            }
            this.apply();
            emit();
        },

        setQuickCssEnabled(on) {
            cfg.quickCssEnabled = on;
            saveSettings();
            this.apply();
        },

        /** Syncs <style> tags with what's enabled. Quick CSS always goes last so it wins. */
        apply() {
            utils.onDomReady(() => {
                const want = new Map();
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
    Obsid.themes = themes;

    themes.refreshLocal();
    for (const o of cfg.online) if (o.enabled) themes.loadOnline(o.url, true);
})();
