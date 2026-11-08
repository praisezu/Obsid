import { native, cleanError } from "../core/native";
import { quickCss } from "../core/quickCss";
import { settings } from "../core/settings";
import { themes } from "../themes";
import { ui, h, type PageContext } from "../ui/components";

ui.registerPage({
    id: "themes",
    label: "Themes",
    icon: "themes",
    order: 3,
    keywords: ["css", "quick css", "appearance"],
    render(ctx) {
        const st = ctx.state;
        st.tab ??= "local";
        ctx.onDispose(themes.onChange(() => { if (st.tab !== "quickcss") ctx.rerender(); }));

        const body = st.tab === "local" ? localTab() : st.tab === "online" ? onlineTab() : quickCssTab(ctx);
        return h("div", { class: "obsid-page" },
            ui.pageHead("Themes", "Restyle Discord with CSS. BetterDiscord themes (.theme.css) work too."),
            ui.tabs([["local", "Local themes"], ["online", "Online themes"], ["quickcss", "Quick CSS"]], st.tab,
                id => { st.tab = id; ctx.rerender(); }),
            body,
        );
    },
});

function localTab() {
    const list = themes.local;
    if (!list.length) {
        return ui.section(null,
            ui.empty("No themes yet. Put .css theme files in your themes folder and they'll show up here.", "themes",
                ui.button("Open themes folder", { variant: "primary", icon: "folder", onClick: () => native.openPath("themes") })));
    }
    return ui.section(null,
        h("div", { class: "obsid-btns" },
            ui.button("Open themes folder", { icon: "folder", onClick: () => native.openPath("themes") }),
            ui.button("Reload", { icon: "refresh", variant: "ghost", onClick: () => { themes.refreshLocal(); ui.toast("Themes reloaded."); } }),
        ),
        h("div", { class: "obsid-grid" }, list.map(t => {
            const on = themes.isEnabled(t.file);
            const m = t.meta;
            const name = m.name || t.file.replace(/(\.theme)?\.css$/i, "");
            return ui.card({ class: "obsid-item" + (on ? " on" : "") },
                h("div", { class: "obsid-item-top" },
                    h("div", { class: "obsid-item-name" }, name, m.version ? ui.tag("v" + m.version) : null),
                    ui.switch({ checked: on, label: `Enable ${name}`, onChange: v => themes.setEnabled(t.file, v) }),
                ),
                h("div", { class: "obsid-item-desc" }, m.description || h("span", { class: "obsid-code" }, t.file)),
                h("div", { class: "obsid-item-foot" },
                    m.author ? h("span", {}, "by " + m.author) : null,
                    h("span", { class: "obsid-spacer" }),
                    m.website || m.source ? ui.button("", { small: true, variant: "ghost", icon: "globe", title: "Website", onClick: () => native.openUrl(m.website || m.source) }) : null,
                    ui.button("", {
                        small: true, variant: "ghost", icon: "trash", title: `Delete ${t.file}`,
                        onClick: async () => {
                            const ok = await ui.confirm({ title: "Delete theme?", danger: true, confirmText: "Move to Recycle Bin", body: `${name} will be moved to the Recycle Bin.` });
                            if (!ok) return;
                            themes.setEnabled(t.file, false);
                            await native.trashTheme(t.file);
                            themes.refreshLocal();
                        },
                    }),
                ),
            );
        })));
}

function onlineTab() {
    const input = h("input", { class: "obsid-input", type: "url", placeholder: "https://example.com/theme.css", "aria-label": "Theme URL" });
    const error = h("div", { class: "obsid-row-desc", style: { color: "var(--o-danger)", minHeight: "18px" }, role: "alert" });
    const add = async () => {
        error.textContent = "";
        try { await themes.addOnline(input.value); input.value = ""; ui.toast("Theme added.", { type: "ok" }); }
        catch (e) { error.textContent = cleanError(e); }
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") add(); });

    const entries = settings.themes.online;
    return ui.section(null,
        ui.card({ class: "obsid-pad", style: { display: "flex", flexDirection: "column", gap: "8px" } },
            h("div", { class: "obsid-row-title" }, "Add a theme from a link"),
            h("div", { class: "obsid-row-desc" }, "Paste a direct link to a .css file, for example a raw GitHub link. It's downloaded each time Discord starts, so it stays up to date."),
            h("div", { class: "obsid-toolbar" }, h("div", { style: { flex: "1" } }, input), ui.button("Add", { variant: "primary", icon: "plus", onClick: add })),
            error,
        ),
        entries.length
            ? h("div", { class: "obsid-list" }, entries.map(o => {
                const s = themes.online.get(o.url) || {};
                const name = s.meta?.name || o.url.split("/").pop() || o.url;
                const status = s.loading ? ui.tag("Loading…") : s.error ? ui.tag("Failed", "danger", s.error) : s.css ? null : ui.tag("Off");
                return ui.card({ class: "obsid-row" },
                    h("div", { class: "obsid-row-text" },
                        h("div", { class: "obsid-row-title", style: { display: "flex", gap: "6px", alignItems: "center" } }, name, status),
                        h("div", { class: "obsid-row-desc obsid-code", style: { overflowWrap: "anywhere" } }, o.url),
                        s.error ? h("div", { class: "obsid-row-desc", style: { color: "var(--o-danger)" } }, s.error) : null),
                    s.error ? ui.button("", { small: true, variant: "ghost", icon: "refresh", title: "Retry", onClick: () => themes.loadOnline(o.url) }) : null,
                    ui.button("", { small: true, variant: "ghost", icon: "trash", title: "Remove", onClick: () => themes.removeOnline(o.url) }),
                    ui.switch({ checked: o.enabled, label: `Enable ${name}`, onChange: v => themes.setOnlineEnabled(o.url, v) }),
                );
            }))
            : ui.empty("No online themes added yet.", "globe"),
    );
}

function quickCssTab(ctx: PageContext) {
    const editor = h("textarea", {
        class: "obsid-editor", spellcheck: "false", "aria-label": "Quick CSS editor",
        placeholder: "/* Your CSS here, applied live. Example: */\n.theme-dark { --background-base-lower: #0c0a10; }",
    });
    editor.value = quickCss.css;
    editor.addEventListener("input", () => quickCss.save(editor.value));
    editor.addEventListener("keydown", e => {
        if (e.key !== "Tab" || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
        quickCss.save(editor.value);
    });
    const sync = () => { if (document.activeElement !== editor) editor.value = quickCss.css; };
    window.addEventListener("obsid:quickcss", sync);
    ctx.onDispose(() => window.removeEventListener("obsid:quickcss", sync));

    return ui.section(null,
        ui.card({ class: "obsid-rows" },
            ui.row({
                title: "Enable Quick CSS",
                description: "Applied on top of your themes, live as you type. Saved to quickCss.css.",
                control: ui.switch({ checked: settings.themes.quickCssEnabled, label: "Enable Quick CSS", onChange: v => themes.setQuickCssEnabled(v) }),
            }),
        ),
        editor,
        h("div", { class: "obsid-btns" },
            ui.button("Open in external editor", { icon: "code", onClick: () => native.openPath("quickcss") }),
            h("span", { class: "obsid-row-desc", style: { alignSelf: "center" } }, "Edits made in another editor show up here automatically."),
        ),
    );
}
