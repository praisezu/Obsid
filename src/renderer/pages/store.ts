/*
 * Plugin Store page. Lists store/plugins.json from the Vanta repo.
 *
 * Trust rules (never based on what an author *calls* themselves):
 *  - Official  = the file lives in store/official/ in the Vanta repo. Only the maintainers can put
 *                files there (pull requests are reviewed), so the path is the proof.
 *  - Community = store/community/. Installing shows a "not made by Vanta" warning first.
 *  - A community plugin whose author name looks like "Vanta" (including look-alike letters,
 *    e.g. Cyrillic "а", or "V4nta") is flagged as an impersonation attempt.
 * Every download is checked against the sha256 recorded when the plugin was reviewed.
 */
import type { StorePlugin } from "@shared/types";
import { native, cleanError } from "../core/native";
import { plugins } from "../core/plugins";
import { settings, saveSettings } from "../core/settings";
import { install } from "../pluginStore";
import { ui, h } from "../ui/components";

export type Trust = "official" | "community" | "impostor";

/** Folds look-alike characters so "Vаntа" (Cyrillic а) or "V4NTA" compare equal to "vanta". */
export function looksLikeVanta(name: string, prefixOnly = false) {
    const map: Record<string, string> = {
        "а": "a", "α": "a", "4": "a", "@": "a", "ą": "a", "á": "a", "à": "a", "â": "a", "ä": "a",
        "ν": "v", "ѵ": "v", "ⅴ": "v", "ᴠ": "v", "υ": "v",
        "η": "n", "п": "n", "ո": "n", "ñ": "n",
        "т": "t", "τ": "t", "7": "t", "ţ": "t",
    };
    const folded = name.normalize("NFKC").toLowerCase().replace(/[\s._\-|'"`*~·]+/g, "")
        .split("").map(c => map[c] ?? c).join("").normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return prefixOnly ? folded.startsWith("vanta") : folded.includes("vanta");
}

export function trustOf(p: StorePlugin): Trust {
    if (p.path.startsWith("store/official/")) return "official";
    // author: anywhere in the name; plugin name: only when it starts with Vanta (so "AdvantageTimer" is fine)
    return looksLikeVanta(p.author) || looksLikeVanta(p.name, true) ? "impostor" : "community";
}

const badge = (t: Trust) => t === "official"
    ? h("span", { class: "vanta-badge official", title: "Made and published by Vanta" }, ui.icon("check", 12), "Official")
    : t === "impostor"
        ? h("span", { class: "vanta-badge impostor", title: "The name looks like Vanta, but this plugin is not from Vanta" }, ui.icon("warn", 12), "Not really Vanta")
        : h("span", { class: "vanta-badge community", title: "Made by someone in the community, not by Vanta" }, "Community");

let index: { plugins: StorePlugin[]; repo: string; branch: string } | null = null;
let indexError: string | null = null;

function installedOf(p: StorePlugin) {
    const file = Object.entries(settings.storeInstalled ?? {}).find(([, v]) => v.path === p.path)?.[0];
    if (file && [...plugins.values()].some(x => x.file === file)) return { file, hash: settings.storeInstalled![file].sha256 };
    return null;
}

/** "Not made by Vanta" warning. Resolves true if the user wants to go ahead. */
function warnUnofficial(p: StorePlugin, trust: Trust) {
    return new Promise<boolean>(resolve => {
        ui.modal({
            title: "This plugin isn't made by Vanta",
            body: [
                h("div", {}, h("b", {}, p.name), ` was made by `, h("b", {}, p.author), " and shared in the community section of the store."),
                trust === "impostor" ? ui.note("danger", `The author calls themselves "${p.author}", which looks like Vanta, but this plugin is NOT from Vanta. Official plugins always have the green Official badge.`) : null,
                ui.note("warn", "Community plugins are checked before they're listed, but Vanta can't guarantee they're safe. A plugin can do anything your Discord account can, including reading your messages."),
                h("div", { class: "vanta-row-desc" }, "You'll see the full code before anything is installed."),
            ],
            buttons: [
                { text: "Cancel", variant: "ghost", value: false },
                { text: "I understand, continue", variant: trust === "impostor" ? "danger solid" : "primary", value: true },
            ],
            onClose: r => resolve(r === true),
        });
    });
}

async function installFromStore(p: StorePlugin, existingFile?: string) {
    const trust = trustOf(p);
    if (trust !== "official" && !existingFile && !(await warnUnofficial(p, trust))) return;
    try {
        const data = await native.storeDownload(p.path, p.sha256);
        const file = await install(data, existingFile ? { fileName: existingFile } : {});
        if (!file) return;
        (settings.storeInstalled ??= {})[file] = { path: p.path, sha256: p.sha256 };
        saveSettings();
    } catch (e) { ui.toast(cleanError(e), { type: "danger", ms: 8000 }); }
}

ui.registerPage({
    id: "store",
    label: "Plugin Store",
    icon: "store",
    order: 2.5,
    keywords: ["store", "download", "community", "marketplace"],
    render(ctx) {
        const st = ctx.state;
        st.q ??= "";
        st.filter ??= "all";
        const grid = h("div", { class: "vanta-grid" });
        const count = h("span", { class: "vanta-count" });
        const onPlugins = () => render();
        window.addEventListener("vanta:plugins", onPlugins);
        ctx.onDispose(() => window.removeEventListener("vanta:plugins", onPlugins));

        const render = () => {
            if (!index) {
                grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } }, indexError
                    ? ui.empty(indexError, "warn", ui.button("Try again", { icon: "refresh", onClick: () => load(true) }))
                    : ui.empty("Loading the plugin store…", "store")));
                return;
            }
            const q = String(st.q).trim().toLowerCase();
            const shown = index.plugins
                .map(p => ({ p, trust: trustOf(p) }))
                .filter(({ p, trust }) => (st.filter === "all" || (st.filter === "official" ? trust === "official" : trust !== "official"))
                    && (!q || [p.name, p.description, p.author, ...(p.tags || [])].join(" ").toLowerCase().includes(q)))
                .sort((a, b) => (a.trust === "official" ? 0 : 1) - (b.trust === "official" ? 0 : 1) || a.p.name.localeCompare(b.p.name));
            count.textContent = `${shown.length} of ${index.plugins.length}`;
            grid.replaceChildren(...shown.map(({ p, trust }) => card(p, trust)));
            if (!shown.length) grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } }, ui.empty(index.plugins.length ? "Nothing matches." : "The store is empty for now. Be the first to submit a plugin!", "store")));
        };

        const card = (p: StorePlugin, trust: Trust) => {
            const inst = installedOf(p);
            const builtIn = plugins.get(p.name) && !plugins.get(p.name)!.file;
            const action = builtIn
                ? ui.button("Built in", { small: true, disabled: true })
                : inst
                    ? inst.hash === p.sha256
                        ? ui.button("Installed", { small: true, icon: "check", disabled: true })
                        : ui.button("Update", { small: true, variant: "primary", icon: "refresh", onClick: async () => { await installFromStore(p, inst.file); render(); } })
                    : ui.button("Install", { small: true, variant: trust === "impostor" ? "danger" : "primary", icon: "download", onClick: async () => { await installFromStore(p); render(); } });
            return ui.card({ class: "vanta-item" },
                h("div", { class: "vanta-item-top" },
                    h("div", { class: "vanta-item-name" }, p.name, badge(trust), p.version ? ui.tag("v" + p.version) : null)),
                h("div", { class: "vanta-item-desc" }, p.description || "No description."),
                h("div", { class: "vanta-item-foot" },
                    h("span", {}, "by " + (trust === "official" ? "Vanta" : p.author)),
                    h("span", { class: "vanta-spacer" }),
                    ui.button("", { small: true, variant: "ghost", icon: "code", title: "View source on GitHub", onClick: () => native.openUrl(`https://github.com/${index!.repo}/blob/${index!.branch}/${p.path}`) }),
                    action));
        };

        const load = async (force = false) => {
            try { index = await native.storeIndex(force); indexError = null; }
            catch (e) { indexError = cleanError(e); }
            if (grid.isConnected || !index) render();
        };

        const search = ui.searchInput("Search the store", v => { st.q = v; render(); });
        search.querySelector("input")!.value = st.q;
        render();
        load();

        return h("div", { class: "vanta-page" },
            h("div", { style: { display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" } },
                h("div", { style: { flex: "1", minWidth: "260px" } },
                    ui.pageHead("Plugin Store", "Plugins made by Vanta and by the community. Anyone can submit theirs.")),
                ui.button("Submit a plugin", { icon: "upload", onClick: () => native.openUrl(`https://github.com/${index?.repo ?? native.info.repo}/blob/main/store/README.md`) }),
            ),
            h("div", { class: "vanta-toolbar" },
                search,
                ui.segment([["all", "All"], ["official", "Official"], ["community", "Community"]], st.filter, v => { st.filter = v; render(); }),
                ui.button("", { variant: "ghost", icon: "refresh", title: "Refresh", onClick: () => load(true) }),
            ),
            ui.note("", h("b", {}, "Only plugins with the green Official badge are made by Vanta."), " Anyone can name themselves \"Vanta\", so the badge, not the author name, is what counts."),
            h("section", { class: "vanta-section" }, h("h2", { class: "vanta-section-title" }, "Plugins ", count), grid),
        );
    },
});
