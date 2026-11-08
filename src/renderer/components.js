/*
 * Obsid — UI toolkit shared by the settings pages, the Discord sidebar section and the quick panel.
 * Plain DOM only (no innerHTML), styled with Discord's own CSS variables so it follows the theme.
 */
(() => {
    const { utils } = Obsid;
    const SVG_NS = "http://www.w3.org/2000/svg";

    const CSS = `
.obsid-scope { --obsid-accent:#8b5cf6; --obsid-accent-hover:#7c4ef0; --obsid-accent-soft:rgba(139,92,246,.16);
  --o-text:var(--text-default,#e9e8ee); --o-muted:var(--text-muted,#9b9aa3); --o-strong:var(--text-strong,#fff);
  --o-card:var(--card-background-default,var(--background-surface-high,#232328));
  --o-input:var(--background-base-lowest,var(--background-base-lower,#18181c));
  --o-line:var(--border-subtle,rgba(150,150,160,.14)); --o-line-strong:var(--border-normal,rgba(150,150,160,.24));
  --o-hover:var(--background-mod-subtle,rgba(150,150,160,.1)); --o-danger:var(--status-danger,#e5484d);
  --o-ok:var(--status-positive,#3ba55c); --o-warn:var(--status-warning,#f0b232);
  --o-r-sm:var(--radius-sm,8px); --o-r-md:var(--radius-md,12px);
  font-family:var(--font-primary,"gg sans","Segoe UI",sans-serif); color:var(--o-text); }
.obsid-scope * { box-sizing:border-box; }
.obsid-page { max-width:760px; margin:0 auto; padding:28px 24px 72px; display:flex; flex-direction:column; gap:28px; }
.obsid-page-head h1 { margin:0; font-size:24px; line-height:30px; font-weight:700; color:var(--o-strong); }
.obsid-page-head p { margin:6px 0 0; color:var(--o-muted); font-size:14px; line-height:20px; }
.obsid-section { display:flex; flex-direction:column; gap:12px; }
.obsid-section-title { margin:0; font-size:12px; line-height:16px; font-weight:700; letter-spacing:.02em;
  text-transform:uppercase; color:var(--o-muted); display:flex; align-items:center; gap:8px; }
.obsid-section-title .obsid-count { font-weight:600; text-transform:none; letter-spacing:0; }
.obsid-card { background:var(--o-card); border:1px solid var(--o-line); border-radius:var(--o-r-md); }
.obsid-pad { padding:16px; }
.obsid-rows > .obsid-row + .obsid-row { border-top:1px solid var(--o-line); }
.obsid-row { display:flex; align-items:center; gap:16px; padding:14px 16px; }
.obsid-row-text { flex:1; min-width:0; }
.obsid-row-title { font-size:15px; line-height:20px; font-weight:600; color:var(--o-strong); }
.obsid-row-desc { margin-top:2px; font-size:13px; line-height:18px; color:var(--o-muted); }
.obsid-switch { all:unset; cursor:pointer; flex-shrink:0; position:relative; width:40px; height:24px; border-radius:12px;
  background:var(--o-line-strong); transition:background .15s ease; }
.obsid-switch::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
  background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); transition:transform .15s ease; }
.obsid-switch[aria-checked=true] { background:var(--obsid-accent); }
.obsid-switch[aria-checked=true]::after { transform:translateX(16px); }
.obsid-switch:disabled { opacity:.45; cursor:not-allowed; }
.obsid-btn { all:unset; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:36px; padding:0 14px; border-radius:var(--o-r-sm); font-size:14px; font-weight:600; white-space:nowrap;
  background:var(--o-hover); color:var(--o-text); border:1px solid var(--o-line); transition:background .12s, border-color .12s; }
.obsid-btn:hover { background:var(--background-mod-normal,rgba(150,150,160,.16)); border-color:var(--o-line-strong); }
.obsid-btn.primary { background:var(--obsid-accent); border-color:transparent; color:#fff; }
.obsid-btn.primary:hover { background:var(--obsid-accent-hover); }
.obsid-btn.danger { background:transparent; color:var(--o-danger); border-color:color-mix(in srgb,var(--o-danger) 45%,transparent); }
.obsid-btn.danger:hover { background:color-mix(in srgb,var(--o-danger) 12%,transparent); }
.obsid-btn.danger.solid { background:var(--o-danger); color:#fff; border-color:transparent; }
.obsid-btn.ghost { background:transparent; border-color:transparent; color:var(--o-muted); }
.obsid-btn.ghost:hover { background:var(--o-hover); color:var(--o-text); }
.obsid-btn.small { height:30px; padding:0 10px; font-size:13px; }
.obsid-btn.icon-only { width:32px; height:32px; padding:0; }
.obsid-btn:disabled, .obsid-btn[aria-disabled=true] { opacity:.5; cursor:not-allowed; }
.obsid-btn svg { flex-shrink:0; }
.obsid-scope :is(.obsid-btn,.obsid-switch,.obsid-tab,.obsid-chip):focus-visible { outline:2px solid var(--obsid-accent); outline-offset:2px; }
.obsid-btns { display:flex; flex-wrap:wrap; gap:8px; }
.obsid-input { width:100%; height:40px; padding:0 12px; border-radius:var(--o-r-sm); border:1px solid var(--o-line-strong);
  background:var(--o-input); color:var(--o-text); font:inherit; font-size:14px; outline:none; }
.obsid-input:focus { border-color:var(--obsid-accent); }
.obsid-input-wrap { position:relative; flex:1; min-width:180px; }
.obsid-input-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--o-muted); pointer-events:none; }
.obsid-input-wrap .obsid-input { padding-left:38px; }
.obsid-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.obsid-segment { display:inline-flex; padding:3px; gap:2px; border-radius:var(--o-r-sm); background:var(--o-input); border:1px solid var(--o-line); }
.obsid-chip { all:unset; cursor:pointer; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600; color:var(--o-muted); }
.obsid-chip:hover { color:var(--o-text); }
.obsid-chip[aria-pressed=true] { background:var(--o-hover); color:var(--o-strong); }
.obsid-tabs { display:flex; gap:4px; border-bottom:1px solid var(--o-line); }
.obsid-tab { all:unset; cursor:pointer; padding:10px 12px; margin-bottom:-1px; font-size:14px; font-weight:600; color:var(--o-muted);
  border-bottom:2px solid transparent; }
.obsid-tab:hover { color:var(--o-text); }
.obsid-tab[aria-selected=true] { color:var(--o-strong); border-bottom-color:var(--obsid-accent); }
.obsid-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
.obsid-item { display:flex; flex-direction:column; gap:10px; padding:14px 16px; transition:border-color .12s; }
.obsid-item:hover { border-color:var(--o-line-strong); }
.obsid-item.on { border-color:color-mix(in srgb,var(--obsid-accent) 40%,var(--o-line)); }
.obsid-item-top { display:flex; align-items:flex-start; gap:12px; }
.obsid-item-name { flex:1; min-width:0; font-size:15px; line-height:20px; font-weight:600; color:var(--o-strong);
  display:flex; align-items:center; gap:6px; flex-wrap:wrap; overflow-wrap:anywhere; }
.obsid-item-desc { font-size:13px; line-height:18px; color:var(--o-muted); overflow-wrap:anywhere; }
.obsid-item-foot { display:flex; align-items:center; gap:8px; margin-top:auto; font-size:12px; color:var(--o-muted); }
.obsid-item-foot .obsid-spacer { flex:1; }
.obsid-tag { display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:4px; font-size:11px;
  font-weight:700; letter-spacing:.02em; background:var(--obsid-accent-soft); color:#c4b5fd; }
.obsid-tag.danger { background:color-mix(in srgb,var(--o-danger) 16%,transparent); color:var(--o-danger); }
.obsid-tag.ok { background:color-mix(in srgb,var(--o-ok) 16%,transparent); color:var(--o-ok); }
.obsid-tag.warn { background:color-mix(in srgb,var(--o-warn) 16%,transparent); color:var(--o-warn); }
.obsid-empty { padding:36px 20px; text-align:center; color:var(--o-muted); font-size:14px; line-height:20px;
  border:1px dashed var(--o-line-strong); border-radius:var(--o-r-md); display:flex; flex-direction:column; align-items:center; gap:12px; }
.obsid-empty svg { opacity:.6; }
.obsid-code { font-family:var(--font-code,Consolas,monospace); font-size:12.5px; }
.obsid-kv { display:grid; grid-template-columns:auto 1fr; gap:8px 20px; font-size:14px; }
.obsid-kv dt { color:var(--o-muted); }
.obsid-kv dd { margin:0; color:var(--o-text); overflow-wrap:anywhere; }
.obsid-editor { width:100%; min-height:420px; resize:vertical; padding:14px 16px; border-radius:var(--o-r-md);
  border:1px solid var(--o-line-strong); background:var(--o-input); color:var(--o-text); outline:none; tab-size:4;
  font:13px/1.6 var(--font-code,Consolas,monospace); white-space:pre; }
.obsid-editor:focus { border-color:var(--obsid-accent); }
.obsid-hero { display:flex; gap:18px; align-items:center; padding:20px; position:relative; overflow:hidden; }
.obsid-hero::before { content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(120% 140% at 0% 0%, rgba(139,92,246,.22), transparent 55%); }
.obsid-hero > * { position:relative; }
.obsid-hero-title { font-size:22px; font-weight:800; color:var(--o-strong); letter-spacing:.01em; }
.obsid-hero-sub { font-size:13px; color:var(--o-muted); margin-top:2px; }
.obsid-stats { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.obsid-stat { padding:4px 10px; border-radius:999px; background:var(--o-hover); font-size:12px; font-weight:600; color:var(--o-text); }
.obsid-stat b { color:#c4b5fd; }
.obsid-list { display:flex; flex-direction:column; gap:8px; }
.obsid-commit { display:flex; gap:12px; align-items:baseline; padding:10px 14px; font-size:14px; }
.obsid-commit code { color:#c4b5fd; }
.obsid-commit .obsid-row-desc { margin:0; white-space:nowrap; }
.obsid-note { display:flex; gap:12px; padding:14px 16px; border-radius:var(--o-r-md); font-size:14px; line-height:20px;
  background:var(--obsid-accent-soft); border:1px solid color-mix(in srgb,var(--obsid-accent) 35%,transparent); }
.obsid-note.warn { background:color-mix(in srgb,var(--o-warn) 10%,transparent); border-color:color-mix(in srgb,var(--o-warn) 35%,transparent); }
.obsid-note.danger { background:color-mix(in srgb,var(--o-danger) 10%,transparent); border-color:color-mix(in srgb,var(--o-danger) 35%,transparent); }
.obsid-note svg { flex-shrink:0; margin-top:1px; }
.obsid-note code { font-family:var(--font-code,Consolas,monospace); font-size:12.5px; padding:1px 4px; border-radius:4px; background:var(--o-hover); }
.obsid-modal-back { position:fixed; inset:0; z-index:100002; display:grid; place-items:center; padding:24px;
  background:rgba(0,0,0,.6); animation:obsid-fade .12s ease-out; }
.obsid-modal { width:min(580px,100%); max-height:85vh; overflow:auto; background:var(--background-base-low,#1f1f24);
  border:1px solid var(--o-line); border-radius:var(--o-r-md); box-shadow:0 20px 60px rgba(0,0,0,.5);
  animation:obsid-rise .16s ease-out; }
.obsid-modal-head { padding:20px 20px 4px; font-size:20px; font-weight:700; color:var(--o-strong); }
.obsid-modal-body { padding:8px 20px 20px; font-size:14px; line-height:20px; color:var(--o-text); display:flex; flex-direction:column; gap:12px; }
.obsid-modal-foot { padding:14px 20px; display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--o-line);
  background:var(--o-hover); }
@keyframes obsid-fade { from { opacity:0 } }
@keyframes obsid-rise { from { opacity:0; transform:translateY(6px) scale(.985) } }
#obsid-toasts { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:100003; display:flex;
  flex-direction:column; gap:8px; align-items:center; pointer-events:none; }
.obsid-toast { pointer-events:auto; display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:var(--o-r-sm);
  background:var(--background-surface-higher,#2b2b31); color:var(--o-text); border:1px solid var(--o-line-strong);
  box-shadow:0 10px 30px rgba(0,0,0,.45); font-size:14px; font-weight:500; animation:obsid-rise .18s ease-out; transition:opacity .25s; }
.obsid-toast svg { color:var(--obsid-accent); }
.obsid-toast.danger svg { color:var(--o-danger); }
.obsid-toast.ok svg { color:var(--o-ok); }
@media (prefers-reduced-motion: reduce) { .obsid-scope *, .obsid-toast, .obsid-modal, .obsid-modal-back { animation:none !important; transition:none !important; } }
`;

    /* -------------------------------------------------------------- icons */
    const ICONS = {
        gem: [
            ["M12 1.5 21 8.25 12 11.25Z", 1], ["M12 1.5 12 11.25 3 8.25Z", .78], ["M3 8.25 12 11.25 6.75 22.5Z", .55],
            ["M21 8.25 17.25 22.5 12 11.25Z", .66], ["M12 11.25 17.25 22.5 6.75 22.5Z", .4],
        ],
        plugins: "M10 2.5a2 2 0 0 1 4 0V4h4a2 2 0 0 1 2 2v4h-1.5a2 2 0 1 0 0 4H20v4a2 2 0 0 1-2 2h-4v-1.5a2 2 0 1 0-4 0V20H6a2 2 0 0 1-2-2v-4h1.5a2 2 0 1 0 0-4H4V6a2 2 0 0 1 2-2h4V2.5Z",
        themes: "M12 2C6.48 2 2 6.03 2 11.1 2 16.56 6.44 21 11.9 21c1.21 0 2.1-.98 2.1-2.15 0-.55-.21-1.05-.55-1.43-.33-.37-.54-.86-.54-1.4 0-1.18.96-2.12 2.14-2.12H17c2.76 0 5-2.24 5-5C22 5.6 17.52 2 12 2ZM6.5 12.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
        updater: "M11 3h2v9.59l3.3-3.3 1.4 1.42L12 16.41l-5.7-5.7 1.4-1.42 3.3 3.3V3ZM4 17h2v2h12v-2h2v4H4v-4Z",
        backup: "M12 4a8 8 0 0 1 7.13 4.38H16.5v2H22V4.88h-2v1.77A10 10 0 0 0 2.05 11h2.02A8 8 0 0 1 12 4Zm-7.13 11.62H7.5v-2H2v5.5h2v-1.77A10 10 0 0 0 21.95 13h-2.02A8 8 0 0 1 4.87 15.62Z",
        search: "M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z",
        folder: "M3 6a2 2 0 0 1 2-2h4.59l2 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
        trash: "M9 3h6l1 2h4v2H4V5h4l1-2ZM6 9h12l-.9 11.1A2 2 0 0 1 15.1 22H8.9a2 2 0 0 1-2-1.9L6 9Z",
        plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
        refresh: "M12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35A7.96 7.96 0 0 0 12 4Z",
        code: "M8.6 6.6 3.2 12l5.4 5.4L10 16l-4-4 4-4-1.4-1.4Zm6.8 0L14 8l4 4-4 4 1.4 1.4 5.4-5.4-5.4-5.4Z",
        globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.93 9h-3.01a15.5 15.5 0 0 0-1.4-5.66A8.02 8.02 0 0 1 18.93 11ZM12 4.04c.92 1.23 1.73 3.66 1.92 6.96h-3.84c.19-3.3 1-5.73 1.92-6.96Zm-2.52 1.3A15.5 15.5 0 0 0 8.08 11H5.07a8.02 8.02 0 0 1 4.41-5.66ZM5.07 13h3.01c.13 2.19.6 4.16 1.4 5.66A8.02 8.02 0 0 1 5.07 13ZM12 19.96c-.92-1.23-1.73-3.66-1.92-6.96h3.84c-.19 3.3-1 5.73-1.92 6.96Zm2.52-1.3c.8-1.5 1.27-3.47 1.4-5.66h3.01a8.02 8.02 0 0 1-4.41 5.66Z",
        sliders: "M3 6h10v2H3V6Zm14-2h2v2h2v2h-2v2h-2V4ZM3 16h4v2H3v-2Zm8-2h2v2h8v2h-8v2h-2v-6Zm-8-3h12v2H3v-2Zm16 0h2v2h-2v-2Z",
        check: "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7 9.5 16.2Z",
        info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v2h-2V7Zm0 4h2v6h-2v-6Z",
        warn: "M12 2 1 21h22L12 2Zm-1 7h2v5h-2V9Zm0 7h2v2h-2v-2Z",
        close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z",
        upload: "M11 21h2v-9.59l3.3 3.3 1.4-1.42L12 7.59l-5.7 5.7 1.4 1.42 3.3-3.3V21ZM4 3h16v4h-2V5H6v2H4V3Z",
        download: "M11 3h2v9.59l3.3-3.3 1.4 1.42L12 16.41l-5.7-5.7 1.4-1.42 3.3 3.3V3ZM4 17h2v2h12v-2h2v4H4v-4Z",
        terminal: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 4v10h16V8H4Zm2.3 2.7 1.4-1.4L11.4 13l-3.7 3.7-1.4-1.4 2.3-2.3-2.3-2.3ZM12 15h6v2h-6v-2Z",
        power: "M11 2h2v10h-2V2Zm-4.24 3.34 1.42 1.42A6 6 0 1 0 15.82 6.76l1.42-1.42A8 8 0 1 1 6.76 5.34Z",
    };

    function icon(name, size = 20) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", size);
        svg.setAttribute("height", size);
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("fill", "currentColor");
        const def = ICONS[name] || ICONS.info;
        for (const [d, opacity] of typeof def === "string" ? [[def, 1]] : def) {
            const p = document.createElementNS(SVG_NS, "path");
            p.setAttribute("d", d);
            p.setAttribute("fill-rule", "evenodd");
            if (opacity !== 1) p.setAttribute("opacity", opacity);
            svg.append(p);
        }
        return svg;
    }

    /** Full-color Obsid gem for headers. */
    function logo(size = 48) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 32 32");
        svg.setAttribute("width", size);
        svg.setAttribute("height", size);
        svg.setAttribute("aria-hidden", "true");
        const facets = [
            ["16,2 28,11 23,30 9,30 4,11", "#2a1f3d"], ["16,2 28,11 16,15", "#a78bfa"], ["16,2 16,15 4,11", "#7c3aed"],
            ["4,11 16,15 9,30", "#4c1d95"], ["28,11 23,30 16,15", "#5b21b6"], ["16,15 23,30 9,30", "#3b1a6e"],
        ];
        for (const [points, fill] of facets) {
            const p = document.createElementNS(SVG_NS, "polygon");
            p.setAttribute("points", points);
            p.setAttribute("fill", fill);
            svg.append(p);
        }
        return svg;
    }

    /* ------------------------------------------------------------ builder */
    function h(tag, props = {}, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (v == null || v === false) continue;
            if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === "class") el.className = v;
            else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
            else if (k === "value" || k === "checked" || k === "disabled") el[k] = v;
            else el.setAttribute(k, v === true ? "" : v);
        }
        for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
        return el;
    }

    function ensureStyle() {
        if (document.getElementById("obsid-ui-style")) return;
        document.head.append(h("style", { id: "obsid-ui-style" }, CSS));
    }

    /* --------------------------------------------------------- components */
    function switchEl({ checked, onChange, label, disabled }) {
        const el = h("button", {
            class: "obsid-switch", role: "switch", type: "button",
            "aria-checked": String(!!checked), "aria-label": label, disabled,
        });
        el.addEventListener("click", e => {
            e.stopPropagation();
            const next = el.getAttribute("aria-checked") !== "true";
            el.setAttribute("aria-checked", String(next));
            onChange?.(next);
        });
        return el;
    }

    function button(text, { variant = "", icon: ic, onClick, small, title, disabled } = {}) {
        const cls = ["obsid-btn", variant, small && "small", !text && "icon-only"].filter(Boolean).join(" ");
        const el = h("button", { class: cls, type: "button", title, "aria-label": !text ? title : null, disabled },
            ic ? icon(ic, small || !text ? 16 : 18) : null, text || null);
        if (onClick) el.addEventListener("click", async e => {
            if (el.disabled) return;
            el.disabled = true;
            try { await onClick(e); } finally { if (el.isConnected) el.disabled = !!disabled; }
        });
        return el;
    }

    const pageHead = (title, subtitle) =>
        h("div", { class: "obsid-page-head" }, h("h1", {}, title), subtitle ? h("p", {}, subtitle) : null);

    const section = (title, ...children) =>
        h("section", { class: "obsid-section" }, title ? h("h2", { class: "obsid-section-title" }, title) : null, children);

    const card = (props, ...children) => h("div", { ...props, class: "obsid-card " + (props?.class || "") }, children);

    function row({ title, description, control }) {
        return h("div", { class: "obsid-row" },
            h("div", { class: "obsid-row-text" },
                h("div", { class: "obsid-row-title" }, title),
                description ? h("div", { class: "obsid-row-desc" }, description) : null),
            control);
    }

    /** A settings row bound to a boolean in Obsid.settings.obsid */
    function settingRow(key, title, description, onChange) {
        return row({
            title, description,
            control: switchEl({
                checked: Obsid.settings.obsid[key], label: title,
                onChange: v => { Obsid.settings.obsid[key] = v; Obsid.saveSettings(); onChange?.(v); },
            }),
        });
    }

    function searchInput(placeholder, onInput) {
        const input = h("input", { class: "obsid-input", type: "search", placeholder, "aria-label": placeholder });
        input.addEventListener("input", () => onInput(input.value));
        return h("div", { class: "obsid-input-wrap" }, icon("search", 18), input);
    }

    function segment(options, value, onChange) {
        const wrap = h("div", { class: "obsid-segment", role: "group" });
        const render = () => {
            wrap.replaceChildren(...options.map(([id, label]) => h("button", {
                class: "obsid-chip", type: "button", "aria-pressed": String(id === value),
                onclick: () => { value = id; render(); onChange(id); },
            }, label)));
        };
        render();
        return wrap;
    }

    function tabs(list, active, onSelect) {
        return h("div", { class: "obsid-tabs", role: "tablist" }, list.map(([id, label]) =>
            h("button", { class: "obsid-tab", role: "tab", type: "button", "aria-selected": String(id === active), onclick: () => onSelect(id) }, label)));
    }

    function empty(text, iconName = "info", ...extra) {
        return h("div", { class: "obsid-empty" }, icon(iconName, 32), h("div", {}, text), extra);
    }

    function note(kind, ...children) {
        return h("div", { class: "obsid-note " + (kind || "") }, icon(kind === "warn" || kind === "danger" ? "warn" : "info", 18), h("div", {}, children));
    }

    function tag(text, kind = "", title) {
        return h("span", { class: "obsid-tag " + kind, title }, text);
    }

    /* ------------------------------------------------------- modal, toast */
    function modal({ title, body, buttons = [], onClose }) {
        ensureStyle();
        const prevFocus = document.activeElement;
        let back;
        const close = result => {
            back.remove();
            document.removeEventListener("keydown", onKey, true);
            prevFocus?.focus?.();
            onClose?.(result);
        };
        const onKey = e => {
            if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(null); }
        };
        const foot = h("div", { class: "obsid-modal-foot" }, buttons.map(b =>
            button(b.text, { variant: b.variant, onClick: async () => { const r = await b.onClick?.(); if (r !== false) close(b.value); } })));
        back = h("div", { class: "obsid-modal-back obsid-scope", onmousedown: e => { if (e.target === back) close(null); } },
            h("div", { class: "obsid-modal", role: "dialog", "aria-modal": "true", "aria-label": title },
                h("div", { class: "obsid-modal-head" }, title),
                h("div", { class: "obsid-modal-body" }, body),
                buttons.length ? foot : null));
        for (const t of ["keydown", "keypress", "keyup"]) back.addEventListener(t, e => { if (e.key !== "Escape") e.stopPropagation(); });
        document.addEventListener("keydown", onKey, true);
        document.body.append(back);
        (back.querySelector("input,textarea") || foot.lastElementChild)?.focus();
        return { close, el: back };
    }

    function confirm({ title, body, confirmText = "Confirm", danger }) {
        return new Promise(resolve => {
            modal({
                title, body,
                buttons: [
                    { text: "Cancel", variant: "ghost", value: false },
                    { text: confirmText, variant: danger ? "danger solid" : "primary", value: true },
                ],
                onClose: r => resolve(r === true),
            });
        });
    }

    function toast(text, { type = "", ms = 4000 } = {}) {
        utils.onDomReady(() => {
            ensureStyle();
            let host = document.getElementById("obsid-toasts");
            if (!host) document.body.append(host = h("div", { id: "obsid-toasts", class: "obsid-scope", role: "status", "aria-live": "polite" }));
            const el = h("div", { class: "obsid-toast " + type },
                type === "danger" ? icon("warn", 18) : type === "ok" ? icon("check", 18) : icon("gem", 18), text);
            host.append(el);
            setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 260); }, ms);
        });
    }

    /* -------------------------------------------------------------- pages */
    const pages = [];
    function registerPage(page) {
        pages.push(page);
        pages.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    }

    /**
     * Mounts a page into `container`. Returns a controller with dispose().
     * Pages get ctx: { rerender(), navigate(id, state), onDispose(fn), state }.
     */
    function mountPage(id, container, { navigate, state = {} } = {}) {
        ensureStyle();
        const page = pages.find(p => p.id === id) || pages[0];
        let disposers = [];
        const dispose = () => { for (const d of disposers.splice(0)) { try { d(); } catch { } } };
        const ctx = {
            state,
            onDispose: fn => disposers.push(fn),
            navigate: (to, s) => navigate ? navigate(to, s) : null,
            rerender() {
                const scroll = container.closest("[data-obsid-scroll]") || container;
                const top = scroll.scrollTop;
                dispose();
                render();
                scroll.scrollTop = top;
            },
        };
        const render = () => {
            let content;
            try { content = page.render(ctx); }
            catch (e) {
                Obsid.logger.error(`Page ${page.id} failed to render`, e);
                content = h("div", { class: "obsid-page" }, note("danger", `This page crashed: ${e.message}`));
            }
            container.replaceChildren(content);
        };
        container.classList.add("obsid-scope");
        render();
        return { page, dispose, ctx };
    }

    Object.assign(Obsid.ui, {
        h, icon, logo, ensureStyle,
        switch: switchEl, button, pageHead, section, card, row, settingRow, searchInput, segment, tabs, empty, note, tag,
        modal, confirm, toast,
        pages, registerPage, mountPage,
    });
})();
