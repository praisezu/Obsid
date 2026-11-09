/*
 * Live plugin editor: write or tweak a plugin inside Discord. Ctrl+S saves it to your plugins folder and reloads it
 * straight away (the running copy is swapped for the new one). Errors show under the editor, the line with a syntax
 * error is marked, and typing `Vanta.` suggests the API.
 */
import { native, cleanError } from "../core/native";
import { plugins, isPluginEnabled, setPluginEnabled } from "../core/plugins";
import { ui, h } from "../ui/components";

const TEMPLATE = `// A Vanta plugin. Ctrl+S saves and reloads it.
Vanta.definePlugin({
    name: "MyPlugin",
    description: "Says hi when it starts.",
    authors: ["you"],
    category: "Utility",
    options: {
        greeting: { type: "string", default: "Hello from my plugin!", label: "Greeting" },
    },
    start() {
        Vanta.ui.toast(this.settings.greeting);
        // Watch for new messages on screen:
        // this.unwatch = Vanta.watchElements('[id^="chat-messages-"]', el => { ... });
    },
    stop() {
        this.unwatch?.();
    },
});
`;

/** Vanta API members for suggestions, e.g. "ui.toast", "watchElements" */
function apiMembers(): string[] {
    const V = (window as any).Vanta ?? {};
    const out: string[] = [];
    for (const k of Object.keys(V)) {
        if (k.startsWith("_")) continue;
        out.push(k);
        const v = V[k];
        if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map))
            for (const k2 of Object.keys(v).slice(0, 60)) if (!k2.startsWith("_")) out.push(`${k}.${k2}`);
    }
    return [...new Set(out)].sort();
}

ui.registerPage({
    id: "editor",
    label: "Plugin editor",
    icon: "code",
    order: 2.4,
    keywords: ["editor", "code", "write plugin", "develop", "make a plugin", "live"],
    render(ctx) {
        const st = ctx.state as { file?: string; code?: string; dirty?: boolean };
        st.file ??= "MyPlugin.js";
        st.code ??= TEMPLATE;

        const fileInput = h("input", { class: "vanta-input", value: st.file, style: { width: "220px" }, "aria-label": "File name" }) as HTMLInputElement;
        fileInput.addEventListener("input", () => { st.file = fileInput.value; });

        const gutter = h("div", { style: { padding: "10px 8px", textAlign: "right", color: "var(--text-muted)", userSelect: "none", whiteSpace: "pre", font: "13px/20px Consolas, ui-monospace, monospace", minWidth: "36px", background: "var(--background-secondary)" } });
        const area = h("textarea", {
            spellcheck: false, "aria-label": "Plugin code",
            style: { flex: "1", minHeight: "420px", resize: "vertical", border: "0", outline: "none", padding: "10px 12px", font: "13px/20px Consolas, ui-monospace, monospace", tabSize: "4", whiteSpace: "pre", overflow: "auto", background: "var(--background-tertiary, #111)", color: "var(--text-normal)" },
        }) as HTMLTextAreaElement;
        area.value = st.code;
        let errLine = -1;
        const drawGutter = () => {
            const n = area.value.split("\n").length;
            gutter.textContent = Array.from({ length: n }, (_, i) => (i + 1 === errLine ? "● " : "") + (i + 1)).join("\n");
            gutter.style.height = area.scrollHeight + "px";
        };
        area.addEventListener("scroll", () => { gutter.scrollTop = area.scrollTop; });
        const editorBox = h("div", { style: { display: "flex", border: "1px solid var(--background-modifier-accent)", borderRadius: "8px", overflow: "hidden", maxHeight: "60vh" } },
            h("div", { style: { overflow: "hidden" } }, gutter), area);

        const status = h("div", {});
        const suggest = h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", minHeight: "26px", alignItems: "center", fontSize: "12px", color: "var(--text-muted)" } });
        const members = apiMembers();

        /** The `Vanta.xxx` being typed at the cursor */
        const typingApi = () => {
            const before = area.value.slice(0, area.selectionStart);
            const m = /Vanta\.([\w.]*)$/.exec(before);
            return m ? m[1] : null;
        };
        const insert = (text: string) => {
            const start = area.selectionStart, end = area.selectionEnd;
            area.setRangeText(text, start, end, "end");
            area.dispatchEvent(new Event("input"));
        };
        const drawSuggest = () => {
            const typed = typingApi();
            if (typed === null) { suggest.replaceChildren(h("span", {}, "Type Vanta. for API suggestions · Tab inserts the first one · Ctrl+S saves and reloads")); return; }
            const hits = members.filter(m => m.toLowerCase().startsWith(typed.toLowerCase())).slice(0, 12);
            suggest.replaceChildren(...hits.map(m => h("button", {
                type: "button", class: "vanta-tag", style: { cursor: "pointer", border: "0" },
                onclick: () => { insert(m.slice(typed.length)); area.focus(); },
            }, "Vanta." + m)));
        };

        area.addEventListener("input", () => { st.code = area.value; st.dirty = true; errLine = -1; drawGutter(); drawSuggest(); });
        area.addEventListener("click", drawSuggest);
        area.addEventListener("keyup", e => { if (e.key.startsWith("Arrow")) drawSuggest(); });
        area.addEventListener("keydown", e => {
            e.stopPropagation(); // keep Discord's keyboard shortcuts out of the editor
            if (e.key === "Tab") {
                e.preventDefault();
                const typed = typingApi();
                const hit = typed !== null && members.find(m => m.toLowerCase().startsWith(typed.toLowerCase()));
                insert(hit ? hit.slice(typed!.length) : "    ");
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
        });

        const fileName = () => {
            let n = (st.file || "MyPlugin.js").trim().replace(/[^\w.\-]+/g, "_");
            if (!n.endsWith(".js")) n += ".js";
            return n;
        };

        async function save() {
            const name = fileName();
            status.replaceChildren(ui.note("", "Saving and reloading…"));
            const before = new Set(plugins.keys());
            try {
                const file = await native.pluginInstall(name, area.value);
                await native.pluginRun(file);
                st.dirty = false;
                const p = [...plugins.values()].find(x => x.file === file);
                if (!p) {
                    status.replaceChildren(ui.note("warn", "Saved, but no plugin registered. Make sure the code calls Vanta.definePlugin({ name: … })."));
                    return;
                }
                if (!before.has(p.name) && !isPluginEnabled(p.name)) await setPluginEnabled(p.name, true); // new plugin: turn it on to try it
                await new Promise(r => setTimeout(r, 300));
                status.replaceChildren(p.error
                    ? ui.note("danger", `${p.name} reloaded, but start() failed: ${p.error}`)
                    : ui.note("", `Saved ${file} and reloaded ${p.name}${isPluginEnabled(p.name) ? " (on)" : " (off: turn it on in Plugins)"}.`));
            } catch (e) {
                const msg = cleanError(e);
                // Syntax errors often say where: "…:12" or "line 12"
                const m = /(?:line |:)(\d+)(?::\d+)?\)?$/.exec(msg);
                errLine = m ? Number(m[1]) : -1;
                drawGutter();
                status.replaceChildren(ui.note("danger", "Couldn't load it: " + msg));
            }
        }

        const openSelect = h("select", { class: "vanta-input", style: { width: "auto" }, "aria-label": "Open an imported plugin" },
            h("option", { value: "" }, "Open an imported plugin…"),
            [...plugins.values()].filter(p => p.file).map(p => h("option", { value: p.file! }, `${p.name} (${p.file})`)));
        openSelect.addEventListener("change", async () => {
            const file = openSelect.value;
            openSelect.value = "";
            if (!file) return;
            if (st.dirty && !(await ui.confirm({ title: "Open another plugin?", body: "Your unsaved changes here will be lost.", confirmText: "Open" }))) return;
            try {
                area.value = st.code = await native.pluginRead(file);
                fileInput.value = st.file = file;
                st.dirty = false; errLine = -1; drawGutter(); drawSuggest();
            } catch (e) { ui.toast("Couldn't open it: " + cleanError(e), { type: "danger" }); }
        });

        drawGutter(); drawSuggest();
        return h("div", { class: "vanta-page" },
            ui.pageHead("Plugin editor", "Write a plugin here. Ctrl+S saves it to your plugins folder and reloads it instantly."),
            h("div", { class: "vanta-toolbar" },
                fileInput,
                ui.button("Save & reload", { variant: "primary", icon: "refresh", onClick: save }),
                openSelect,
                ui.button("New", { variant: "ghost", icon: "plus", onClick: async () => {
                    if (st.dirty && !(await ui.confirm({ title: "Start a new plugin?", body: "Your unsaved changes here will be lost.", confirmText: "Start new" }))) return;
                    area.value = st.code = TEMPLATE; fileInput.value = st.file = "MyPlugin.js"; st.dirty = false; drawGutter(); drawSuggest();
                } }),
                ui.button("Plugins folder", { variant: "ghost", icon: "folder", onClick: () => native.openPath("plugins") })),
            suggest,
            editorBox,
            status);
    },
});
