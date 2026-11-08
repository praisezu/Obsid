import { native } from "../core/native";
import { plugins, isPluginEnabled, setPluginEnabled, type PluginInstance } from "../core/plugins";
import { saveSettings, saveSettingsNow } from "../core/settings";
import { pluginStore } from "../pluginStore";
import { checkPluginUpdates, knownUpdates, updateAll } from "../pluginUpdates";
import { ui, h } from "../ui/components";

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

        const grid = h("div", { class: "vanta-grid" });
        const count = h("span", { class: "vanta-count" });

        const renderGrid = () => {
            const q = String(st.query).trim().toLowerCase();
            const all = [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
            const list = all.filter(p => {
                const on = isPluginEnabled(p.name);
                if (st.filter === "enabled" && !on) return false;
                if (st.filter === "disabled" && on) return false;
                if (st.filter === "installed" && !p.file) return false;
                if (st.category && (p.category || "Other") !== st.category) return false;
                if (!q) return true;
                // Settings search: also match each option's label and description
                return [p.name, p.description, p.category, ...(p.authors || []), ...optionText(p)].join(" ").toLowerCase().includes(q);
            });
            count.textContent = `${list.length} of ${all.length}`;
            grid.replaceChildren(...list.map(p => pluginCard(p, renderGrid, q)));
            if (!list.length)
                grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } },
                    ui.empty(st.filter === "installed" && !q ? "You haven't imported any plugins yet." :
                        q ? `No plugins match "${st.query}".` : "No plugins here.", "search")));
        };
        const onPlugins = () => renderGrid();
        window.addEventListener("vanta:plugins", onPlugins);
        ctx.onDispose(() => window.removeEventListener("vanta:plugins", onPlugins));

        // "N plugin updates available" banner
        const updatesBox = h("div", {});
        const renderUpdates = () => {
            const u = knownUpdates();
            updatesBox.replaceChildren(...(u.length ? [ui.note("", h("b", {}, `${u.length} plugin update${u.length === 1 ? "" : "s"} available: `), u.map(x => x.name).join(", "), " ",
                ui.button("Update all", { small: true, variant: "primary", icon: "download", onClick: async () => { await updateAll(); renderUpdates(); renderGrid(); } }))] : []));
        };
        window.addEventListener("vanta:plugin-updates", renderUpdates);
        ctx.onDispose(() => window.removeEventListener("vanta:plugin-updates", renderUpdates));
        renderUpdates();
        checkPluginUpdates().then(renderUpdates);

        const search = ui.searchInput("Search plugins and settings", v => { st.query = v; renderGrid(); });
        search.querySelector("input")!.value = st.query;

        const categories = [...new Set([...plugins.values()].map(p => p.category || "Other"))].sort();
        const catSelect = h("select", { class: "vanta-input", style: { width: "auto", minWidth: "150px" }, "aria-label": "Category" },
            h("option", { value: "" }, "All categories"),
            categories.map(c => h("option", { value: c, selected: c === st.category ? true : null }, c)));
        catSelect.addEventListener("change", () => { st.category = catSelect.value; renderGrid(); });

        renderGrid();
        const page = h("div", { class: "vanta-page" },
            h("div", { style: { display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" } },
                h("div", { style: { flex: "1", minWidth: "260px" } },
                    ui.pageHead("Plugins", "Turn features on and off. Import your own from a file or a link.")),
                ui.button("Import plugin", { variant: "primary", icon: "plus", onClick: () => pluginStore.openImportDialog() }),
            ),
            updatesBox,
            h("div", { class: "vanta-toolbar" },
                search,
                catSelect,
                ui.segment([["all", "All"], ["enabled", "On"], ["disabled", "Off"], ["installed", "Imported"]], st.filter,
                    v => { st.filter = v; renderGrid(); }),
            ),
            h("section", { class: "vanta-section" },
                h("h2", { class: "vanta-section-title" }, "Plugins ", count),
                grid),
        );

        // Drag a .js file anywhere on the page to import it.
        let depth = 0;
        const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes("Files");
        const setDrag = (on: boolean) => { page.style.outline = on ? "2px dashed var(--vanta-accent)" : ""; page.style.outlineOffset = "-8px"; };
        page.addEventListener("dragenter", e => { if (hasFiles(e)) { e.preventDefault(); depth++; setDrag(true); } });
        page.addEventListener("dragover", e => { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); } });
        page.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; setDrag(false); } });
        page.addEventListener("drop", e => {
            const file = e.dataTransfer?.files?.[0];
            depth = 0; setDrag(false);
            if (!file) return;
            e.preventDefault();
            e.stopPropagation();
            pluginStore.fromDrop(file);
        });
        return page;
    },
});

const optionText = (p: PluginInstance) => Object.values(p.options || {}).flatMap(o => [o.label ?? "", o.description ?? ""]);

function pluginCard(p: PluginInstance, rerender: () => void, q = "") {
    // When the search matched a setting (not the plugin itself), say which one
    const settingHit = q && ![p.name, p.description, p.category].join(" ").toLowerCase().includes(q)
        ? Object.values(p.options || {}).find(o => [o.label, o.description].join(" ").toLowerCase().includes(q)) : null;
    const on = isPluginEnabled(p.name);
    const hasOptions = Object.keys(p.options || {}).length > 0 || typeof p.settingsPanel === "function";
    const source = pluginStore.sourceOf(p);
    const tags: Node[] = [];
    if (p.since && p.since === __VANTA_VERSION__) tags.push(ui.tag("New", "ok", `Added in Vanta ${p.since}`));
    if (p.file) tags.push(ui.tag("Imported", "ok", p.file));
    if (p.error) tags.push(ui.tag("Error", "danger", p.error));
    if (p.restartNeeded) tags.push(ui.tag("Restart", "warn", "Turning this on or off needs a Discord restart"));
    if (p.needsWebpack) tags.push(ui.tag("Internals", "", "Hooks into Discord's code. May break after Discord updates."));

    return ui.card({ class: "vanta-item" + (on ? " on" : "") },
        h("div", { class: "vanta-item-top" },
            h("div", { class: "vanta-item-name" }, p.name, tags),
            ui.switch({
                checked: on, label: `Enable ${p.name}`,
                onChange: async v => {
                    await setPluginEnabled(p.name, v);
                    if (p.restartNeeded) await promptRestart(p.name, v);
                    else if (p.error) ui.toast(`${p.name} failed to start: ${p.error}`, { type: "danger" });
                    rerender();
                },
            }),
        ),
        h("div", { class: "vanta-item-desc" }, p.description || "No description."),
        settingHit ? h("div", { class: "vanta-item-desc", style: { color: "var(--vanta-accent)" } }, "Setting: " + (settingHit.label || settingHit.description)) : null,
        p.error ? h("div", { class: "vanta-item-desc", style: { color: "var(--o-danger)" } }, p.error) : null,
        h("div", { class: "vanta-item-foot" },
            h("span", {}, [p.category, p.authors?.length ? "by " + p.authors.join(", ") : null].filter(Boolean).join(" · ")),
            h("span", { class: "vanta-spacer" }),
            source ? ui.button("", { small: true, variant: "ghost", icon: "refresh", title: "Check for update", onClick: () => pluginStore.update(p) }) : null,
            p.file ? ui.button("", { small: true, variant: "ghost", icon: "trash", title: `Delete ${p.name}`, onClick: () => pluginStore.remove(p) }) : null,
            hasOptions ? ui.button("Settings", { small: true, variant: "ghost", icon: "sliders", onClick: () => openOptions(p) }) : null,
        ),
    );
}

/** For plugins marked restartNeeded: ask to restart Discord so the change takes effect. */
export async function promptRestart(name: string, enabled: boolean) {
    const ok = await ui.confirm({
        title: "Restart Discord?",
        body: `${name} was turned ${enabled ? "on" : "off"}, but it needs a restart of Discord to take effect. Restart Discord now?`,
        confirmText: "Restart now",
        cancelText: "Later",
    });
    if (!ok) { ui.toast(`${name} will take effect the next time Discord restarts.`); return; }
    await saveSettingsNow();
    native.relaunch();
}

function openOptions(p: PluginInstance) {
    const rows = Object.entries(p.options || {}).map(([key, opt]) => {
        const set = (v: unknown) => { p.settings[key] = v; saveSettings(); p.onSettingChange?.(key, v); };
        const label = opt.label || key;
        let control: HTMLElement;
        if (opt.type === "boolean") {
            control = ui.switch({ checked: !!p.settings[key], onChange: set, label });
        } else if (opt.type === "select") {
            const sel = h("select", { class: "vanta-input", style: { width: "200px" }, "aria-label": label },
                (opt.options || []).map(o => h("option", { value: o.value, selected: o.value === p.settings[key] ? true : null }, o.label)));
            sel.addEventListener("change", () => set(sel.value));
            control = sel;
        } else if (opt.type === "text") {
            // Multi-line: rendered below the label instead of beside it.
            const area = h("textarea", { class: "vanta-editor", style: { minHeight: "120px" }, spellcheck: "false", placeholder: opt.placeholder || "", "aria-label": label });
            area.value = String(p.settings[key] ?? "");
            area.addEventListener("input", () => set(area.value));
            return h("div", { class: "vanta-row", style: { flexDirection: "column", alignItems: "stretch", gap: "8px" } },
                h("div", {}, h("div", { class: "vanta-row-title" }, label), opt.description ? h("div", { class: "vanta-row-desc" }, opt.description) : null),
                area);
        } else {
            const input = h("input", {
                class: "vanta-input", style: { width: "220px" },
                type: opt.type === "number" ? "number" : "text", value: String(p.settings[key] ?? ""), placeholder: opt.placeholder,
                "aria-label": label,
            });
            input.addEventListener("input", () => set(opt.type === "number" ? Number(input.value) : input.value));
            control = input;
        }
        return ui.row({ title: label, description: opt.description, control });
    });
    let panel: Node | null = null;
    if (typeof p.settingsPanel === "function") {
        try { panel = p.settingsPanel(); } catch (e: any) { panel = ui.note("danger", "Settings panel crashed: " + e.message); }
    }
    ui.modal({
        title: p.name,
        body: [
            h("div", { class: "vanta-row-desc" }, p.description),
            rows.length ? ui.card({ class: "vanta-rows" }, rows) : null,
            panel,
        ],
        buttons: [{ text: "Done", variant: "primary" }],
    });
}

void native;
