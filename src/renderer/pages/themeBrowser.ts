/* "Browse" tab on the Themes page: BetterDiscord's theme store, installable in one click. */
import type { BdTheme } from "@shared/types";
import { native, cleanError } from "../core/native";
import { settings, saveSettings } from "../core/settings";
import { themes } from "../themes";
import { ui, h, type PageContext } from "../ui/components";

let list: BdTheme[] | null = null;
let loadError: string | null = null;
let loading: Promise<void> | null = null;

const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);

function load(force = false) {
    loading ??= native.bdThemes(force)
        .then(t => { list = t; loadError = null; })
        .catch(e => { loadError = cleanError(e); })
        .finally(() => { loading = null; });
    return loading;
}

/** File name of an installed BetterDiscord theme, if any. */
function installedFile(t: BdTheme) {
    const map = (settings.themes.bd ??= {});
    const file = map[t.id];
    if (file && themes.local.some(l => l.file === file)) return file;
    return themes.local.find(l => l.meta.name?.toLowerCase() === t.name.toLowerCase())?.file ?? null;
}

export function browseTab(ctx: PageContext) {
    const st = ctx.state;
    st.bdQuery ??= "";
    st.bdSort ??= "popular";

    const grid = h("div", { class: "vanta-grid vanta-theme-grid" });
    const count = h("span", { class: "vanta-count" });

    const render = () => {
        if (!list) {
            grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } }, loadError
                ? ui.empty(`Couldn't load BetterDiscord's themes: ${loadError}`, "warn", ui.button("Try again", { icon: "refresh", onClick: async () => { await load(true); render(); } }))
                : ui.empty("Loading themes from betterdiscord.app…", "themes")));
            return;
        }
        const q = String(st.bdQuery).trim().toLowerCase();
        const shown = list
            .filter(t => !q || [t.name, t.description, t.author, ...t.tags].join(" ").toLowerCase().includes(q))
            .sort((a, b) => st.bdSort === "liked" ? b.likes - a.likes : st.bdSort === "new" ? b.released.localeCompare(a.released) : b.downloads - a.downloads);
        count.textContent = `${shown.length} of ${list.length}`;
        grid.replaceChildren(...shown.map(t => card(t, render)));
        if (!shown.length) grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } }, ui.empty(`No themes match "${st.bdQuery}".`, "search")));
    };

    const search = ui.searchInput("Search BetterDiscord themes", v => { st.bdQuery = v; render(); });
    search.querySelector("input")!.value = st.bdQuery;

    render();
    if (!list) load().then(() => { if (grid.isConnected) render(); });

    return ui.section(null,
        h("div", { class: "vanta-toolbar" },
            search,
            ui.segment([["popular", "Popular"], ["liked", "Most liked"], ["new", "Newest"]], st.bdSort, v => { st.bdSort = v; render(); }),
        ),
        h("div", { class: "vanta-row-desc" }, "Themes from ", h("b", {}, "betterdiscord.app"), ". Made by the community, not by Vanta. Installing one turns off your current theme."),
        h("h2", { class: "vanta-section-title" }, "Themes ", count),
        grid,
    );
}

function card(t: BdTheme, rerender: () => void) {
    const file = installedFile(t);
    const active = !!file && themes.isEnabled(file);
    const img = t.thumbnail
        ? h("img", { class: "vanta-theme-thumb", src: t.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })
        : h("div", { class: "vanta-theme-thumb" });
    img.addEventListener("error", () => img.replaceWith(h("div", { class: "vanta-theme-thumb" })));

    const action = active
        ? ui.button("Applied", { small: true, icon: "check", disabled: true })
        : file
            ? ui.button("Apply", { small: true, variant: "primary", onClick: () => { themes.setEnabled(file, true); ui.toast(`Applied ${t.name}`, { type: "ok" }); rerender(); } })
            : ui.button("Install & apply", {
                small: true, variant: "primary", icon: "download",
                onClick: async () => {
                    try {
                        const saved = await native.bdInstallTheme(t.id);
                        (settings.themes.bd ??= {})[t.id] = saved;
                        saveSettings();
                        themes.refreshLocal();
                        themes.setEnabled(saved, true);
                        ui.toast(`Installed ${t.name}`, { type: "ok" });
                    } catch (e) { ui.toast(`Couldn't install ${t.name}: ${cleanError(e)}`, { type: "danger", ms: 7000 }); }
                    rerender();
                },
            });

    return ui.card({ class: "vanta-item vanta-theme-card" + (active ? " on" : "") },
        img,
        h("div", { class: "vanta-item-top" },
            h("div", { class: "vanta-item-name" }, t.name),
            h("span", { class: "vanta-row-desc", style: { margin: 0, whiteSpace: "nowrap" } }, `♥ ${fmt(t.likes)} · ↓ ${fmt(t.downloads)}`)),
        h("div", { class: "vanta-item-desc" }, t.description || "No description."),
        h("div", { class: "vanta-item-foot" },
            h("span", {}, "by " + t.author),
            h("span", { class: "vanta-spacer" }),
            ui.button("", { small: true, variant: "ghost", icon: "globe", title: "View on betterdiscord.app", onClick: () => native.openUrl(t.page) }),
            action),
    );
}
