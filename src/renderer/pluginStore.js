/*
 * Obsid — plugin importing. Install .js plugins from a file, a link (GitHub links work), or by
 * dragging a file onto the Plugins page. Every install shows a review screen first, because a
 * plugin can do anything your Discord account can.
 */
(() => {
    const { ui, native, settings, saveSettings } = Obsid;
    const { h } = ui;
    settings.pluginSources ??= {};

    const clean = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

    function parseInfo(code) {
        const meta = {};
        const block = code.match(/^\s*\/\*\*([\s\S]*?)\*\//);
        if (block) for (const m of block[1].matchAll(/@(\w+)[ \t]+([^\r\n]+)/g)) meta[m[1]] = m[2].trim();
        const field = key => code.match(new RegExp(`definePlugin\\s*\\(\\s*\\{[\\s\\S]*?\\b${key}\\s*:\\s*(["'\`])([\\s\\S]*?)\\1`))?.[2];
        const isObsid = /Obsid\s*\.\s*definePlugin\s*\(/.test(code);
        const isBetterDiscord = !isObsid && /module\.exports\s*=|BdApi\b/.test(code);
        const isVencord = !isObsid && /from\s+["']@(utils|api|webpack)|definePlugin\s*\(\s*\{[\s\S]*patches\s*:/.test(code);

        const flags = [];
        if (/\bgetToken\b|["']token["']|localStorage\s*\.\s*(getItem\s*\(\s*["']token|token)|authorization/i.test(code))
            flags.push(["danger", "Mentions your login token. A plugin with your token can take over your account."]);
        if (/\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendBeacon/.test(code))
            flags.push(["warn", "Sends network requests. It could send data to other websites."]);
        if (/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(\s*["'`]/.test(code))
            flags.push(["warn", "Runs code it builds at runtime (eval). Hard to review."]);
        if (/\bnative\.(pluginInstall|backupApply|resetSettings|relaunch)\b|ObsidNative/.test(code))
            flags.push(["warn", "Uses Obsid's native functions (files, restart)."]);

        return {
            name: meta.name || field("name"),
            description: meta.description || field("description"),
            author: meta.author || field("authors")?.replace(/["'`]/g, ""),
            version: meta.version,
            isObsid, isBetterDiscord, isVencord, flags,
            lines: code.split("\n").length,
        };
    }

    /** Shows the review screen. Resolves true if the user clicks Install. */
    function review({ fileName, code, url }, info, replacing) {
        return new Promise(resolve => {
            const details = h("details", { style: { border: "1px solid var(--o-line)", borderRadius: "8px" } },
                h("summary", { style: { cursor: "pointer", padding: "10px 12px", fontWeight: "600" } }, `View code (${info.lines} lines)`),
                h("pre", { class: "obsid-code", style: { margin: "0", padding: "12px", maxHeight: "260px", overflow: "auto",
                    borderTop: "1px solid var(--o-line)", whiteSpace: "pre", background: "var(--o-input)" } }, code));
            ui.modal({
                title: replacing ? `Update ${info.name}?` : `Install ${info.name || fileName}?`,
                body: [
                    ui.card({ class: "obsid-pad", style: { display: "flex", flexDirection: "column", gap: "6px" } },
                        h("div", { class: "obsid-row-title" }, info.name || fileName, info.version ? " " : null, info.version ? ui.tag("v" + info.version) : null),
                        info.description ? h("div", { class: "obsid-row-desc" }, info.description) : null,
                        h("div", { class: "obsid-row-desc" }, info.author ? `by ${info.author} · ` : "", url ? h("span", { class: "obsid-code", style: { overflowWrap: "anywhere" } }, url) : fileName),
                    ),
                    ui.note("warn", "Plugins run with full access to your Discord account. Only install plugins from people you trust."),
                    info.flags.map(([kind, text]) => ui.note(kind, text)),
                    details,
                ],
                buttons: [
                    { text: "Cancel", variant: "ghost", value: false },
                    { text: replacing ? "Update" : "Install", variant: info.flags.some(f => f[0] === "danger") ? "danger solid" : "primary", value: true },
                ],
                onClose: r => resolve(r === true),
            });
        });
    }

    async function install(data, { fileName } = {}) {
        const info = parseInfo(data.code);
        if (!info.isObsid) {
            ui.modal({
                title: "Not an Obsid plugin",
                body: [
                    h("div", {}, `${data.fileName} doesn't call Obsid.definePlugin(), so Obsid can't load it.`),
                    info.isBetterDiscord ? ui.note("", "This looks like a BetterDiscord plugin. Those use a different API and won't run in Obsid.") : null,
                    info.isVencord ? ui.note("", "This looks like Vencord plugin source code. Vencord plugins have to be built into Vencord and won't run here.") : null,
                ],
                buttons: [{ text: "OK", variant: "primary" }],
            });
            return null;
        }
        const targetName = fileName || data.fileName;
        const replacing = fileName ? true : await native.pluginExists(targetName);
        if (!(await review(data, info, replacing))) return null;
        try {
            const file = await native.pluginInstall(targetName, data.code);
            if (data.url) settings.pluginSources[file] = data.url;
            else delete settings.pluginSources[file];
            saveSettings();
            await native.pluginRun(file);
            const p = [...Obsid.plugins.values()].find(x => x.file === file);
            ui.toast(p ? (replacing ? `Updated ${p.name}.` : `Installed ${p.name}. Turn it on below.`) : `Installed ${file}. Reload Discord if it doesn't show up.`, { type: "ok" });
            return file;
        } catch (e) {
            ui.toast("Install failed: " + clean(e), { type: "danger", ms: 7000 });
            return null;
        }
    }

    const store = {
        parseInfo,
        install,
        async fromFile() {
            try { const data = await native.pluginPickFile(); if (data) return install(data); }
            catch (e) { ui.toast(clean(e), { type: "danger" }); }
        },
        async fromUrl(url) {
            const data = await native.pluginFetch(url); // throws to caller for inline error
            return install(data);
        },
        async fromDrop(file) {
            if (!/\.js$/i.test(file.name)) { ui.toast("Drop a .js plugin file.", { type: "danger" }); return; }
            if (file.size > 2 * 1024 * 1024) { ui.toast("Plugin file is larger than 2 MB.", { type: "danger" }); return; }
            return install({ fileName: file.name, code: await file.text() });
        },
        sourceOf: p => (p.file && settings.pluginSources[p.file]) || null,
        async update(p) {
            const url = store.sourceOf(p);
            if (!url) return;
            try {
                const data = await native.pluginFetch(url);
                const current = await native.pluginRead(p.file);
                if (data.code === current) { ui.toast(`${p.name} is up to date.`); return; }
                return install(data, { fileName: p.file });
            } catch (e) { ui.toast(`Couldn't update ${p.name}: ${clean(e)}`, { type: "danger" }); }
        },
        async remove(p) {
            const ok = await ui.confirm({
                title: `Delete ${p.name}?`, danger: true, confirmText: "Delete plugin",
                body: `${p.file} will be moved to the Recycle Bin and the plugin stops running now.`,
            });
            if (!ok) return;
            await Obsid.removePlugin(p.name);
            try { await native.pluginTrash(p.file); } catch (e) { ui.toast(clean(e), { type: "danger" }); }
            delete settings.pluginSources[p.file];
            saveSettings();
            ui.toast(`Deleted ${p.name}.`);
        },
        openImportDialog() {
            const input = h("input", { class: "obsid-input", type: "url", placeholder: "https://github.com/user/repo/blob/main/MyPlugin.js", "aria-label": "Plugin link" });
            const error = h("div", { class: "obsid-row-desc", role: "alert", style: { color: "var(--o-danger)", minHeight: "18px" } });
            let dialog;
            const go = async () => {
                error.textContent = "";
                if (!input.value.trim()) { error.textContent = "Paste a link first."; return false; }
                try { dialog.close(); await store.fromUrl(input.value); }
                catch (e) { ui.toast(clean(e), { type: "danger", ms: 7000 }); }
                return false;
            };
            input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
            dialog = ui.modal({
                title: "Import a plugin",
                body: [
                    h("div", { class: "obsid-row-title" }, "From a link"),
                    h("div", { class: "obsid-row-desc" }, "A direct link to a .js file. GitHub file links are converted to raw links for you. Plugins added from a link can be updated with one click later."),
                    input, error,
                    h("div", { class: "obsid-row-title", style: { marginTop: "4px" } }, "From your computer"),
                    h("div", { class: "obsid-btns" },
                        ui.button("Choose .js file…", { icon: "folder", onClick: () => { dialog.close(); return store.fromFile(); } }),
                        h("span", { class: "obsid-row-desc", style: { alignSelf: "center" } }, "or drag a file onto the Plugins page")),
                ],
                buttons: [
                    { text: "Cancel", variant: "ghost" },
                    { text: "Import from link", variant: "primary", onClick: go },
                ],
            });
        },
    };

    Obsid.pluginStore = store;
})();
