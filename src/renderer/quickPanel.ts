/*
 * Quick panel: Ctrl+Shift+O opens every Vanta page in a pop-up from anywhere in Discord,
 * without going through User Settings.
 */
import { settings } from "./core/settings";
import { ui, h, pages, mountPage, ensureStyle } from "./ui/components";

const CSS = `
#vanta-quick { position:fixed; inset:0; z-index:100001; display:grid; place-items:center; padding:32px;
  background:rgba(0,0,0,.62); animation:vanta-fade .12s ease-out; }
#vanta-quick .oq-window { width:min(1040px,100%); height:min(720px,100%); display:flex; overflow:hidden;
  background:var(--background-base-low,#1f1f24); border:1px solid var(--o-line); border-radius:var(--o-r-md);
  box-shadow:0 24px 80px rgba(0,0,0,.55); animation:vanta-rise .16s ease-out; }
#vanta-quick .oq-side { width:232px; flex-shrink:0; padding:20px 12px; display:flex; flex-direction:column; gap:2px;
  background:var(--background-base-lower,#18181c); border-right:1px solid var(--o-line); }
#vanta-quick .oq-brand { display:flex; align-items:center; gap:10px; padding:0 10px 18px; }
#vanta-quick .oq-brand b { display:block; font-size:17px; color:var(--o-strong); }
#vanta-quick .oq-brand span { font-size:12px; color:var(--o-muted); }
#vanta-quick .oq-item { all:unset; cursor:pointer; display:flex; align-items:center; gap:10px; padding:8px 10px;
  border-radius:var(--o-r-sm); font-size:15px; font-weight:500; color:var(--o-muted); }
#vanta-quick .oq-item:hover { background:var(--o-hover); color:var(--o-text); }
#vanta-quick .oq-item[aria-current=page] { background:var(--background-mod-normal,rgba(150,150,160,.16)); color:var(--o-strong); }
#vanta-quick .oq-item:focus-visible { outline:2px solid var(--vanta-accent); outline-offset:-2px; }
#vanta-quick .oq-foot { margin-top:auto; padding:10px; font-size:12px; color:var(--o-muted); line-height:18px; }
#vanta-quick .oq-foot kbd { font:inherit; font-weight:600; padding:1px 5px; border-radius:4px; background:var(--o-hover); color:var(--o-text); }
#vanta-quick .oq-main { flex:1; min-width:0; position:relative; }
#vanta-quick .oq-scroll { position:absolute; inset:0; overflow:auto; }
#vanta-quick .oq-close { position:absolute; top:14px; right:16px; z-index:1; }
@media (max-width:700px) { #vanta-quick { padding:0; } #vanta-quick .oq-side { width:64px; }
  #vanta-quick .oq-item span, #vanta-quick .oq-brand div, #vanta-quick .oq-foot { display:none; } }
`;

let root: HTMLElement | null = null;
let scroll: HTMLElement | null = null;
let nav: HTMLElement | null = null;
let controller: ReturnType<typeof mountPage> | null = null;
let lastFocus: HTMLElement | null = null;
let lastPage = "vanta";
const states: Record<string, Record<string, any>> = {};

export function show(pageId = lastPage) {
    ensureStyle();
    if (!document.getElementById("vanta-quick-style")) document.head.append(h("style", { id: "vanta-quick-style" }, CSS));
    if (root) return select(pageId);
    lastFocus = document.activeElement as HTMLElement | null;

    nav = h("nav", { class: "oq-side", "aria-label": "Vanta settings" },
        h("div", { class: "oq-brand" }, ui.logo(32), h("div", {}, h("b", {}, "Vanta"), h("span", {}, "v" + __VANTA_VERSION__))),
        pages.map(p => h("button", { class: "oq-item", type: "button", "data-page": p.id, onclick: () => select(p.id) },
            ui.icon(p.icon, 20), h("span", {}, p.label))),
        h("div", { class: "oq-foot" }, h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Shift"), "+", h("kbd", {}, "O"),
            " toggles this panel. Also in User Settings › Vanta Settings."),
    );
    scroll = h("div", { class: "oq-scroll", "data-vanta-scroll": "" });
    const el: HTMLElement = h("div", { id: "vanta-quick", class: "vanta-scope", onmousedown: (e: MouseEvent) => { if (e.target === el) hide(); } },
        h("div", { class: "oq-window", role: "dialog", "aria-modal": "true", "aria-label": "Vanta" },
            nav,
            h("div", { class: "oq-main" },
                h("div", { class: "oq-close" }, ui.button("", { variant: "ghost", icon: "close", title: "Close", onClick: hide })),
                scroll)));
    root = el;
    el.setAttribute("data-no-focus-lock", "true"); // stay usable if a Discord modal is open underneath
    // Keep Discord from reacting to keys typed inside the panel.
    for (const t of ["keydown", "keypress", "keyup", "paste"])
        el.addEventListener(t, e => { if ((e as KeyboardEvent).key !== "Escape") e.stopPropagation(); });
    document.body.append(el);
    select(pageId);
    nav.querySelector<HTMLElement>(`[data-page="${lastPage}"]`)?.focus();
}

function select(pageId: string, state?: Record<string, any>) {
    if (!root || !scroll || !nav) return show(pageId);
    if (state) Object.assign(states[pageId] ??= {}, state);
    controller?.dispose();
    lastPage = pageId;
    controller = mountPage(pageId, scroll, { state: states[pageId] ??= {}, navigate: (to, s) => select(to, s) });
    scroll.scrollTop = 0;
    for (const b of nav.querySelectorAll<HTMLElement>(".oq-item"))
        if (b.dataset.page === controller.page.id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
}

export function hide() {
    if (!root) return;
    controller?.dispose();
    controller = null;
    root.remove();
    root = scroll = nav = null;
    lastFocus?.focus?.();
}

document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyO" && settings.vanta.quickPanel) {
        e.preventDefault();
        e.stopImmediatePropagation();
        root ? hide() : show();
    } else if (e.key === "Escape" && root && !document.querySelector(".vanta-modal-back")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        hide();
    }
}, true);

export const quickPanel = { show, hide };
