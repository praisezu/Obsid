(() => {
    const { ui } = Obsid;
    const { h } = ui;

    ui.registerPage({
        id: "plugins",
        label: "Plugins",
        icon: "plugins",
        order: 2,
        keywords: ["import", "install", "extensions"],
        render(ctx) {
            const st = ctx.state;
            st.query ??= "";
            st.filter ??= "all";
            st.category ??= "";

            const grid = h("div", { class: "obsid-grid" });
            const count = h("span", { class: "obsid-count" });

            const renderGrid = () => {
                if (!grid.isConnected && grid.childElementCount) return;
                const q = st.query.trim().toLowerCase();
                const all = [...Obsid.plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
                const list = all.filter(p => {
                    const on = Obsid.isPluginEnabled(p.name);
                    if (st.filter === "enabled" && !on) return false;
                    if (st.filter === "disabled" && on) return false;
                    if (st.filter === "installed" && !p.file) return false;
                    if (st.category && (p.category || "Other") !== st.category) return false;
                    if (!q) return true;
                    return [p.name, p.description, p.category, ...(p.authors || [])].join(" ").toLowerCase().includes(q);
                });
                count.textContent = `${list.length} of ${all.length}`;
                grid.replaceChildren(...list.map(p => pluginCard(p, renderGrid)));
                if (!list.length)
                    grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } },
                        ui.empty(st.filter === "installed" && !q ? "You haven't imported any plugins yet." :
                            q ? `No plugins match "${st.query}".` : "No plugins here.", "search")));
            };
            const onPlugins = () => renderGrid();
            window.addEventListener("obsid:plugins", onPlugins);
            ctx.onDispose(() => window.removeEventListener("obsid:plugins", onPlugins));

            const search = ui.searchInput("Search plugins", v => { st.query = v; renderGrid(); });
            search.querySelector("input").value = st.query;

            const categories = [...new Set([...Obsid.plugins.values()].map(p => p.category || "Other"))].sort();
            const catSelect = h("select", { class: "obsid-input", style: { width: "auto", minWidth: "150px" }, "aria-label": "Category" },
                h("option", { value: "" }, "All categories"),
                categories.map(c => h("option", { value: c, selected: c === st.category ? true : null }, c)));
            catSelect.addEventListener("change", () => { st.category = catSelect.value; renderGrid(); });

            renderGrid();
            const page = h("div", { class: "obsid-page" },
                h("div", { style: { display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" } },
                    h("div", { style: { flex: "1", minWidth: "260px" } },
                        ui.pageHead("Plugins", "Turn features on and off. Import your own from a file or a link.")),
                    ui.button("Import plugin", { variant: "primary", icon: "plus", onClick: () => Obsid.pluginStore.openImportDialog() }),
                ),
                h("div", { class: "obsid-toolbar" },
                    search,
                    catSelect,
                    ui.segment([["all", "All"], ["enabled", "On"], ["disabled", "Off"], ["installed", "Imported"]], st.filter,
                        v => { st.filter = v; renderGrid(); }),
                ),
                h("section", { class: "obsid-section" },
                    h("h2", { class: "obsid-section-title" }, "Plugins ", count),
                    grid),
            );

            // Drag a .js file anywhere on the page to import it.
            let depth = 0;
            const setDrag = on => { page.style.outline = on ? "2px dashed var(--obsid-accent)" : ""; page.style.outlineOffset = "-8px"; };
            page.addEventListener("dragenter", e => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); depth++; setDrag(true); } });
            page.addEventListener("dragover", e => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); e.stopPropagation(); } });
            page.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; setDrag(false); } });
            page.addEventListener("drop", e => {
                const file = e.dataTransfer?.files?.[0];
                depth = 0; setDrag(false);
                if (!file) return;
                e.preventDefault();
                e.stopPropagation();
                Obsid.pluginStore.fromDrop(file);
            });
            return page;
        },
    });

    function pluginCard(p, rerender) {
        const on = Obsid.isPluginEnabled(p.name);
        const hasOptions = Object.keys(p.options || {}).length > 0 || typeof p.settingsPanel === "function";
        const source = Obsid.pluginStore.sourceOf(p);
        const tags = [];
        if (p.file) tags.push(ui.tag("Imported", "ok", p.file));
        if (p.error) tags.push(ui.tag("Error", "danger", p.error));
        if (p.restartNeeded) tags.push(ui.tag("Restart", "warn", "Needs a reload to apply"));
        if (p.needsWebpack) tags.push(ui.tag("Internals", "", "Hooks into Discord's code. May break after Discord updates."));

        return ui.card({ class: "obsid-item" + (on ? " on" : "") },
            h("div", { class: "obsid-item-top" },
                h("div", { class: "obsid-item-name" }, p.name, tags),
                ui.switch({
                    checked: on, label: `Enable ${p.name}`,
                    onChange: async v => {
                        await Obsid.setPluginEnabled(p.name, v);
                        if (p.restartNeeded) ui.toast(`${p.name} will apply after you reload Discord.`);
                        else if (p.error) ui.toast(`${p.name} failed to start: ${p.error}`, { type: "danger" });
                        rerender();
                    },
                }),
            ),
            h("div", { class: "obsid-item-desc" }, p.description || "No description."),
            p.error ? h("div", { class: "obsid-item-desc", style: { color: "var(--o-danger)" } }, p.error) : null,
            h("div", { class: "obsid-item-foot" },
                h("span", {}, [p.category, p.authors?.length ? "by " + p.authors.join(", ") : null].filter(Boolean).join(" · ")),
                h("span", { class: "obsid-spacer" }),
                source ? ui.button("", { small: true, variant: "ghost", icon: "refresh", title: "Check for update", onClick: () => Obsid.pluginStore.update(p) }) : null,
                p.file ? ui.button("", { small: true, variant: "ghost", icon: "trash", title: `Delete ${p.name}`, onClick: () => Obsid.pluginStore.remove(p) }) : null,
                hasOptions ? ui.button("Settings", { small: true, variant: "ghost", icon: "sliders", onClick: () => openOptions(p) }) : null,
            ),
        );
    }

    function openOptions(p) {
        const rows = Object.entries(p.options || {}).map(([key, opt]) => {
            const set = v => { p.settings[key] = v; Obsid.saveSettings(); p.onSettingChange?.(key, v); };
            const label = opt.label || key;
            let control;
            if (opt.type === "boolean") {
                control = ui.switch({ checked: !!p.settings[key], onChange: set, label });
            } else if (opt.type === "select") {
                control = h("select", { class: "obsid-input", style: { width: "200px" }, "aria-label": label },
                    opt.options.map(o => h("option", { value: o.value, selected: o.value === p.settings[key] ? true : null }, o.label)));
                control.addEventListener("change", () => set(control.value));
            } else if (opt.type === "text") {
                // Multi-line: render below the label instead of beside it.
                const area = h("textarea", { class: "obsid-editor", style: { minHeight: "120px" }, spellcheck: "false",
                    placeholder: opt.placeholder || "", "aria-label": label });
                area.value = String(p.settings[key] ?? "");
                area.addEventListener("input", () => set(area.value));
                return h("div", { class: "obsid-row", style: { flexDirection: "column", alignItems: "stretch", gap: "8px" } },
                    h("div", {}, h("div", { class: "obsid-row-title" }, label),
                        opt.description ? h("div", { class: "obsid-row-desc" }, opt.description) : null),
                    area);
            } else {
                control = h("input", {
                    class: "obsid-input", style: { width: "220px" },
                    type: opt.type === "number" ? "number" : "text", value: String(p.settings[key] ?? ""), placeholder: opt.placeholder,
                    "aria-label": label,
                });
                control.addEventListener("input", () => set(opt.type === "number" ? Number(control.value) : control.value));
            }
            return ui.row({ title: label, description: opt.description, control });
        });
        let panel = null;
        if (typeof p.settingsPanel === "function") {
            try { panel = p.settingsPanel(); } catch (e) { panel = ui.note("danger", "Settings panel crashed: " + e.message); }
        }
        ui.modal({
            title: p.name,
            body: [
                h("div", { class: "obsid-row-desc" }, p.description),
                rows.length ? ui.card({ class: "obsid-rows" }, rows) : null,
                panel,
            ],
            buttons: [{ text: "Done", variant: "primary" }],
        });
    }
})();
