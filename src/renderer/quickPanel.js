/*
 * Obsid — quick panel. Ctrl+Shift+O opens all Obsid pages in a pop-up from anywhere in Discord,
 * without going through User Settings.
 */
(() => {
    const { ui, settings } = Obsid;
    const { h } = ui;

    const CSS = `
#obsid-quick { position:fixed; inset:0; z-index:100001; display:grid; place-items:center; padding:32px;
  background:rgba(0,0,0,.62); animation:obsid-fade .12s ease-out; }
#obsid-quick .oq-window { width:min(1040px,100%); height:min(720px,100%); display:flex; overflow:hidden;
  background:var(--background-base-low,#1f1f24); border:1px solid var(--o-line); border-radius:var(--o-r-md);
  box-shadow:0 24px 80px rgba(0,0,0,.55); animation:obsid-rise .16s ease-out; }
#obsid-quick .oq-side { width:232px; flex-shrink:0; padding:20px 12px; display:flex; flex-direction:column; gap:2px;
  background:var(--background-base-lower,#18181c); border-right:1px solid var(--o-line); }
#obsid-quick .oq-brand { display:flex; align-items:center; gap:10px; padding:0 10px 18px; }
#obsid-quick .oq-brand b { display:block; font-size:17px; color:var(--o-strong); }
#obsid-quick .oq-brand span { font-size:12px; color:var(--o-muted); }
#obsid-quick .oq-item { all:unset; cursor:pointer; display:flex; align-items:center; gap:10px; padding:8px 10px;
  border-radius:var(--o-r-sm); font-size:15px; font-weight:500; color:var(--o-muted); }
#obsid-quick .oq-item:hover { background:var(--o-hover); color:var(--o-text); }
#obsid-quick .oq-item[aria-current=page] { background:var(--background-mod-normal,rgba(150,150,160,.16)); color:var(--o-strong); }
#obsid-quick .oq-item:focus-visible { outline:2px solid var(--obsid-accent); outline-offset:-2px; }
#obsid-quick .oq-foot { margin-top:auto; padding:10px; font-size:12px; color:var(--o-muted); line-height:18px; }
#obsid-quick .oq-foot kbd { font:inherit; font-weight:600; padding:1px 5px; border-radius:4px; background:var(--o-hover); color:var(--o-text); }
#obsid-quick .oq-main { flex:1; min-width:0; position:relative; }
#obsid-quick .oq-scroll { position:absolute; inset:0; overflow:auto; }
#obsid-quick .oq-close { position:absolute; top:14px; right:16px; z-index:1; }
@media (max-width:700px) { #obsid-quick { padding:0; } #obsid-quick .oq-side { width:64px; }
  #obsid-quick .oq-item span, #obsid-quick .oq-brand div, #obsid-quick .oq-foot { display:none; } }
`;

    let root = null, controller = null, lastFocus = null, lastPage = "obsid";
    const states = {};

    function show(pageId = lastPage) {
        ui.ensureStyle();
        if (!document.getElementById("obsid-quick-style")) document.head.append(h("style", { id: "obsid-quick-style" }, CSS));
        if (root) return select(pageId);
        lastFocus = document.activeElement;

        const nav = h("nav", { class: "oq-side", "aria-label": "Obsid settings" },
            h("div", { class: "oq-brand" }, ui.logo(32), h("div", {}, h("b", {}, "Obsid"), h("span", {}, "v" + Obsid.version))),
            ui.pages.map(p => h("button", { class: "oq-item", type: "button", "data-page": p.id, onclick: () => select(p.id) },
                ui.icon(p.icon, 20), h("span", {}, p.label))),
            h("div", { class: "oq-foot" }, h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Shift"), "+", h("kbd", {}, "O"),
                " toggles this panel. Also in User Settings › Obsid Settings."),
        );
        const scroll = h("div", { class: "oq-scroll", "data-obsid-scroll": "" });
        root = h("div", { id: "obsid-quick", class: "obsid-scope", onmousedown: e => { if (e.target === root) hide(); } },
            h("div", { class: "oq-window", role: "dialog", "aria-modal": "true", "aria-label": "Obsid" },
                nav,
                h("div", { class: "oq-main" },
                    h("div", { class: "oq-close" }, ui.button("", { variant: "ghost", icon: "close", title: "Close", onClick: hide })),
                    scroll)));
        root._scroll = scroll;
        root._nav = nav;
        // Keep Discord from reacting to keys typed inside the panel.
        for (const t of ["keydown", "keypress", "keyup", "paste"])
            root.addEventListener(t, e => { if (e.key !== "Escape") e.stopPropagation(); });
        document.body.append(root);
        select(pageId);
        root._nav.querySelector(`[data-page="${lastPage}"]`)?.focus();
    }

    function select(pageId, state) {
        if (!root) return show(pageId);
        if (state) Object.assign(states[pageId] ??= {}, state);
        controller?.dispose();
        lastPage = pageId;
        controller = ui.mountPage(pageId, root._scroll, { state: states[pageId] ??= {}, navigate: (to, s) => select(to, s) });
        root._scroll.scrollTop = 0;
        for (const b of root._nav.querySelectorAll(".oq-item"))
            if (b.dataset.page === controller.page.id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    }

    function hide() {
        if (!root) return;
        controller?.dispose();
        controller = null;
        root.remove();
        root = null;
        lastFocus?.focus?.();
    }

    document.addEventListener("keydown", e => {
        if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyO" && settings.obsid.quickPanel) {
            e.preventDefault();
            e.stopImmediatePropagation();
            root ? hide() : show();
        } else if (e.key === "Escape" && root && !document.querySelector(".obsid-modal-back")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            hide();
        }
    }, true);

    Object.assign(ui, { open: show, close: hide });
})();
