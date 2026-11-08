/*
 * Obsid — renderer core. Runs in Discord's page (main world).
 * Defines window.Obsid: settings, logger, webpack finder, patcher, net hooks, plugin manager.
 */
(() => {
    if (window.Obsid) return;
    const native = window.ObsidNative;

    /* ------------------------------------------------------------ logger */
    const makeLogger = tag => {
        const style = "color:#a78bfa;font-weight:bold";
        const prefix = tag ? `[Obsid:${tag}]` : "[Obsid]";
        return {
            log: (...a) => console.log(`%c${prefix}`, style, ...a),
            warn: (...a) => console.warn(`%c${prefix}`, style, ...a),
            error: (...a) => console.error(`%c${prefix}`, style, ...a),
        };
    };
    const logger = makeLogger();

    /* ---------------------------------------------------------- settings */
    const settings = native.getSettings() || {};
    settings.plugins ??= {};
    settings.obsid = { startupToast: true, quickPanel: true, autoCheckUpdates: true, ...settings.obsid };
    settings.themes = { enabled: [], online: [], ...settings.themes };
    let saveTimer;
    const saveSettings = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => native.setSettings(settings), 250);
    };

    /* ----------------------------------------------------------- helpers */
    const onDomReady = fn => {
        if (document.readyState !== "loading" && document.body) fn();
        else document.addEventListener("DOMContentLoaded", fn, { once: true });
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* ----------------------------------------------------------- webpack */
    const NOT_A_PROP = "__obsidDefinitelyNotARealProp__";
    const isSearchable = v => {
        try {
            return v != null && (typeof v === "object" || typeof v === "function") &&
                v !== window && v !== document && v[NOT_A_PROP] === undefined; // skips catch-all Proxies
        } catch { return false; }
    };

    const filters = {
        byProps: (...props) => m => props.every(p => m[p] !== undefined),
        byCode: (...code) => m => {
            if (typeof m !== "function") return false;
            let s; try { s = Function.prototype.toString.call(m); } catch { return false; }
            return code.every(c => s.includes(c));
        },
        byStoreName: name => m => m?.getName?.() === name && typeof m.getName === "function",
    };

    const webpack = {
        /** Discord loads several webpack runtimes that share one chunk array; we keep all of them. */
        requires: [],
        _lastInit: 0,
        _settled: false,
        filters,
        /** The runtime with the most modules (Discord's main one). */
        get require() {
            let best = null, size = -1;
            for (const r of this.requires) {
                const n = r.c ? Object.keys(r.c).length : 0;
                if (n > size) { best = r; size = n; }
            }
            return best;
        },
        init() {
            if (this._settled) return true;
            const chunk = window.webpackChunkdiscord_app;
            if (!chunk?.push) return false;
            if (Date.now() - this._lastInit < 2000) return this.requires.length > 0;
            this._lastInit = Date.now();
            try {
                // Every runtime in the push chain calls our callback with its own require.
                chunk.push([[Symbol("obsid")], {}, r => { if (r?.c && !this.requires.includes(r)) this.requires.push(r); }]);
                chunk.pop();
            } catch (e) { logger.error("webpack init failed", e); }
            // Stop re-probing once Discord's main runtime (thousands of modules) is in.
            const main = this.require;
            if (main && Object.keys(main.c).length > 2000) this._settled = true;
            return this.requires.length > 0;
        },
        /** Yields every candidate export: module.exports and each of its own properties. */
        *candidates() {
            if (!this.init()) return;
            for (const r of this.requires) {
                const cache = r.c;
                for (const id in cache) {
                    const exp = cache[id]?.exports;
                    if (!isSearchable(exp)) continue;
                    yield exp;
                    if (typeof exp !== "object") continue;
                    for (const key in exp) {
                        let v; try { v = exp[key]; } catch { continue; }
                        if (isSearchable(v)) yield v;
                    }
                }
            }
        },
        find(filter) {
            for (const m of this.candidates()) {
                try { if (filter(m)) return m; } catch { }
            }
            return null;
        },
        findAll(filter) {
            const out = new Set();
            for (const m of this.candidates()) { try { if (filter(m)) out.add(m); } catch { } }
            return [...out];
        },
        findByProps: (...p) => webpack.find(filters.byProps(...p)),
        findByCode: (...c) => webpack.find(filters.byCode(...c)),
        findStore: name => webpack.find(filters.byStoreName(name)),
        /** Polls until a module matching `filter` exists. Rejects after `timeout` ms. */
        async waitFor(filter, timeout = 60000) {
            const end = Date.now() + timeout;
            while (Date.now() < end) {
                const m = webpack.find(filter);
                if (m) return m;
                await sleep(250);
            }
            throw new Error("webpack.waitFor timed out");
        },
    };
    // Resolves once Discord's core stores have loaded.
    webpack.ready = webpack.waitFor(filters.byProps("getCurrentUser", "getUser"), 120000)
        .then(() => logger.log("Webpack ready"))
        .catch(e => logger.error("Webpack never became ready:", e));

    /* ----------------------------------------------------------- patcher */
    const PATCH = Symbol("obsid.patch");

    function getPatchInfo(obj, method) {
        const current = obj[method];
        if (current?.[PATCH]) return current[PATCH];
        if (typeof current !== "function") throw new TypeError(`${method} is not a function`);

        const info = { original: current, before: new Set(), instead: new Set(), after: new Set(), wrapper: null };
        const wrapper = function (...args) {
            const self = this;
            for (const b of info.before) {
                try { const r = b.call(self, args); if (Array.isArray(r)) args = r; }
                catch (e) { logger.error(`before-patch on ${method} threw`, e); }
            }
            let call = (...a) => info.original.apply(self, a);
            for (const fn of info.instead) {
                const next = call;
                call = (...a) => {
                    try { return fn.call(self, a, next); }
                    catch (e) { logger.error(`instead-patch on ${method} threw`, e); return next(...a); }
                };
            }
            let result = call(...args);
            for (const a of info.after) {
                try { const r = a.call(self, args, result); if (r !== undefined) result = r; }
                catch (e) { logger.error(`after-patch on ${method} threw`, e); }
            }
            return result;
        };
        wrapper[PATCH] = info;
        wrapper.toString = () => info.original.toString();
        Object.setPrototypeOf(wrapper, Object.getPrototypeOf(current));
        info.wrapper = wrapper;
        setProp(obj, method, wrapper);
        return info;
    }

    function setProp(obj, key, value) {
        try { obj[key] = value; } catch { }
        if (obj[key] !== value)
            Object.defineProperty(obj, key, { value, configurable: true, writable: true, enumerable: true });
    }

    function addPatch(type, obj, method, fn) {
        const info = getPatchInfo(obj, method);
        info[type].add(fn);
        return () => {
            info[type].delete(fn);
            if (!info.before.size && !info.instead.size && !info.after.size && obj[method] === info.wrapper)
                setProp(obj, method, info.original);
        };
    }

    const patcher = {
        /** fn(args) — may mutate args or return a new args array. Returns unpatch(). */
        before: (obj, method, fn) => addPatch("before", obj, method, fn),
        /** fn(args, original) — return value replaces the result. Returns unpatch(). */
        instead: (obj, method, fn) => addPatch("instead", obj, method, fn),
        /** fn(args, result) — return non-undefined to replace the result. Returns unpatch(). */
        after: (obj, method, fn) => addPatch("after", obj, method, fn),
    };

    /* --------------------------------------------------------------- net */
    // Request-level hooks over XHR/fetch/sendBeacon. Plugins add blockers / body transformers.
    const net = {
        blockers: new Set(),     // ({ method, url }) => boolean
        transformers: new Set(), // ({ method, url, body }) => newBody | undefined   (string bodies only)
        block(fn) { this.blockers.add(fn); return () => this.blockers.delete(fn); },
        /** fn gets string (JSON) bodies only, unless { anyBody: true } is passed (FormData, Blob, …). */
        transform(fn, { anyBody = false } = {}) {
            fn.__anyBody = anyBody;
            this.transformers.add(fn);
            return () => this.transformers.delete(fn);
        },
        isBlocked(req) {
            for (const b of this.blockers) { try { if (b(req)) return true; } catch (e) { logger.error(e); } }
            return false;
        },
        applyTransforms(req) {
            if (req.body == null) return req.body;
            for (const t of this.transformers) {
                if (typeof req.body !== "string" && !t.__anyBody) continue;
                try { const r = t(req); if (r !== undefined) req.body = r; } catch (e) { logger.error(e); }
            }
            return req.body;
        },
    };

    const absUrl = u => { try { return new URL(String(u), location.href).href; } catch { return String(u); } };

    (() => {
        const XHR = XMLHttpRequest.prototype;
        const origOpen = XHR.open, origSend = XHR.send;
        XHR.open = function (method, url, ...rest) {
            this.__obsid = { method: String(method).toUpperCase(), url: absUrl(url) };
            return origOpen.call(this, method, url, ...rest);
        };
        XHR.send = function (body) {
            const req = this.__obsid;
            if (req) {
                req.body = body;
                if (net.isBlocked(req)) return fakeXhrSuccess(this);
                body = net.applyTransforms(req);
            }
            return origSend.call(this, body);
        };
        function fakeXhrSuccess(xhr) {
            const def = (k, v) => Object.defineProperty(xhr, k, { configurable: true, get: () => v });
            def("readyState", 4); def("status", 204); def("statusText", "No Content");
            def("responseText", ""); def("response", ""); def("responseURL", xhr.__obsid.url);
            setTimeout(() => { for (const t of ["readystatechange", "load", "loadend"]) xhr.dispatchEvent(new Event(t)); });
        }

        const origFetch = window.fetch;
        window.fetch = function (input, init = {}) {
            const isReq = input instanceof Request;
            const req = {
                method: String(init.method || (isReq ? input.method : "GET")).toUpperCase(),
                url: absUrl(isReq ? input.url : input),
                body: init.body,
            };
            if (net.isBlocked(req)) return Promise.resolve(new Response(null, { status: 204 }));
            if (init.body != null) {
                const body = net.applyTransforms(req);
                if (body !== init.body) init = { ...init, body };
            }
            return origFetch.call(this, input, init);
        };

        if (navigator.sendBeacon) {
            const origBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = (url, data) =>
                net.isBlocked({ method: "POST", url: absUrl(url), body: data }) ? true : origBeacon(url, data);
        }
    })();

    /* ---------------------------------------------------------- quick css */
    const quickCss = {
        el: null,
        css: native.getQuickCss() || "",
        get enabled() { return settings.themes?.quickCssEnabled !== false; },
        /** Writes the current CSS into the page (or clears it while Quick CSS is switched off). */
        apply() {
            onDomReady(() => {
                if (!this.el) {
                    this.el = document.createElement("style");
                    this.el.id = "obsid-quickcss";
                    document.head.append(this.el);
                }
                const css = this.enabled ? this.css : "";
                if (this.el.textContent !== css) this.el.textContent = css;
            });
        },
        save(css) {
            this.css = css;
            this.apply();
            clearTimeout(this._t);
            this._t = setTimeout(() => native.setQuickCss(css), 300);
        },
    };
    native.onQuickCssChange(css => {
        quickCss.css = css;
        quickCss.apply();
        window.dispatchEvent(new CustomEvent("obsid:quickcss"));
    });

    /* ----------------------------------------------------- common modules */
    /** Lazily-found Discord modules plugins use a lot. Each is null until Discord has loaded it. */
    function makeCommon() {
        const lookups = {
            FluxDispatcher: () => webpack.findByProps("dispatch", "subscribe", "unsubscribe"),
            UserStore: () => webpack.findByProps("getCurrentUser", "getUser"),
            ChannelStore: () => webpack.findByProps("getChannel", "getDMFromUserId"),
            GuildStore: () => webpack.findByProps("getGuild", "getGuilds"),
            MessageStore: () => webpack.findByProps("getMessage", "getMessages"),
            SelectedChannelStore: () => webpack.findByProps("getChannelId", "getLastSelectedChannelId"),
            SelectedGuildStore: () => webpack.findByProps("getGuildId", "getLastSelectedGuildId"),
            RelationshipStore: () => webpack.findByProps("isBlocked", "getFriendIDs"),
        };
        const cache = {};
        const common = {};
        for (const [name, find] of Object.entries(lookups)) {
            Object.defineProperty(common, name, {
                enumerable: true,
                get: () => cache[name] ??= find() ?? undefined,
            });
        }
        return common;
    }

    /* ----------------------------------------------------------- plugins */
    const plugins = new Map();

    function pluginSettings(name) {
        return (settings.plugins[name] ??= { enabled: false, options: {} });
    }

    let booted = false;

    function definePlugin(p) {
        if (!p?.name) throw new Error("Plugin needs a name");
        p.file = window.Obsid?.__currentFile || null; // set for plugins installed by the user
        const existing = plugins.get(p.name);
        if (existing) {
            // Re-defining a user plugin from the same file = an update: swap it in place.
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
        p.logger = makeLogger(p.name);
        Object.defineProperty(p, "settings", { get: () => pluginSettings(p.name).options });
        plugins.set(p.name, p);
        if (booted) { saveSettings(); if (s.enabled) startPlugin(p); }
        window.dispatchEvent(new CustomEvent("obsid:plugins"));
        return p;
    }

    /** Removes a plugin from the running client (used when deleting a user plugin). */
    async function removePlugin(name) {
        const p = plugins.get(name);
        if (!p) return;
        await stopPlugin(p);
        plugins.delete(name);
        delete settings.plugins[name];
        saveSettings();
        window.dispatchEvent(new CustomEvent("obsid:plugins"));
    }

    async function startPlugin(p) {
        if (p.started) return true;
        try {
            if (p.needsWebpack) await webpack.ready;
            await p.start?.();
            p.started = true;
            p.error = null;
            logger.log(`Started ${p.name}`);
        } catch (e) {
            p.error = String(e?.message || e);
            logger.error(`Failed to start ${p.name}:`, e);
        }
        return p.started;
    }

    async function stopPlugin(p) {
        if (!p.started) return true;
        try { await p.stop?.(); p.started = false; logger.log(`Stopped ${p.name}`); }
        catch (e) { logger.error(`Failed to stop ${p.name}:`, e); }
        return !p.started;
    }

    async function setPluginEnabled(name, enabled) {
        const p = plugins.get(name);
        if (!p) return;
        pluginSettings(name).enabled = enabled;
        saveSettings();
        if (!p.restartNeeded) await (enabled ? startPlugin(p) : stopPlugin(p));
    }

    function startAll() {
        booted = true;
        saveSettings();
        for (const p of plugins.values())
            if (pluginSettings(p.name).enabled) startPlugin(p);
    }

    window.Obsid = {
        version: native.info.version,
        native,
        logger, makeLogger,
        settings, saveSettings,
        webpack, patcher, net, quickCss,
        utils: { onDomReady, sleep },
        plugins,
        definePlugin,
        removePlugin,
        common: makeCommon(),
        isPluginEnabled: name => !!settings.plugins[name]?.enabled,
        setPluginEnabled,
        startAll,
        ui: {}, // filled by components.js and the page files
    };

    quickCss.apply();
    logger.log(`v${native.info.version} core loaded`);
})();
