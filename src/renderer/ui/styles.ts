/** Styles for every Vanta UI surface. Uses Discord's CSS variables so it follows the theme. */
export const CSS = `
.vanta-scope { --vanta-accent:#8b5cf6; --vanta-accent-hover:#7c4ef0; --vanta-accent-soft:rgba(139,92,246,.16);
  --o-text:var(--text-default,#e9e8ee); --o-muted:var(--text-muted,#9b9aa3); --o-strong:var(--text-strong,#fff);
  --o-card:var(--card-background-default,var(--background-surface-high,#232328));
  --o-input:var(--background-base-lowest,var(--background-base-lower,#18181c));
  --o-line:var(--border-subtle,rgba(150,150,160,.14)); --o-line-strong:var(--border-normal,rgba(150,150,160,.24));
  --o-hover:var(--background-mod-subtle,rgba(150,150,160,.1)); --o-danger:var(--status-danger,#e5484d);
  --o-ok:var(--status-positive,#3ba55c); --o-warn:var(--status-warning,#f0b232);
  --o-r-sm:var(--radius-sm,8px); --o-r-md:var(--radius-md,12px);
  font-family:var(--font-primary,"gg sans","Segoe UI",sans-serif); color:var(--o-text); }
.vanta-scope * { box-sizing:border-box; }
.vanta-page { max-width:760px; margin:0 auto; padding:28px 24px 72px; display:flex; flex-direction:column; gap:28px; }
.vanta-page-head h1 { margin:0; font-size:24px; line-height:30px; font-weight:700; color:var(--o-strong); }
.vanta-page-head p { margin:6px 0 0; color:var(--o-muted); font-size:14px; line-height:20px; }
.vanta-section { display:flex; flex-direction:column; gap:12px; }
.vanta-section-title { margin:0; font-size:12px; line-height:16px; font-weight:700; letter-spacing:.02em;
  text-transform:uppercase; color:var(--o-muted); display:flex; align-items:center; gap:8px; }
.vanta-section-title .vanta-count { font-weight:600; text-transform:none; letter-spacing:0; }
.vanta-card { background:var(--o-card); border:1px solid var(--o-line); border-radius:var(--o-r-md); }
.vanta-pad { padding:16px; }
.vanta-rows > .vanta-row + .vanta-row { border-top:1px solid var(--o-line); }
.vanta-row { display:flex; align-items:center; gap:16px; padding:14px 16px; }
.vanta-row-text { flex:1; min-width:0; }
.vanta-row-title { font-size:15px; line-height:20px; font-weight:600; color:var(--o-strong); }
.vanta-row-desc { margin-top:2px; font-size:13px; line-height:18px; color:var(--o-muted); }
.vanta-switch { all:unset; cursor:pointer; flex-shrink:0; position:relative; width:40px; height:24px; border-radius:12px;
  background:var(--o-line-strong); transition:background .15s ease; }
.vanta-switch::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
  background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); transition:transform .15s ease; }
.vanta-switch[aria-checked=true] { background:var(--vanta-accent); }
.vanta-switch[aria-checked=true]::after { transform:translateX(16px); }
.vanta-switch:disabled { opacity:.45; cursor:not-allowed; }
.vanta-btn { all:unset; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:36px; padding:0 14px; border-radius:var(--o-r-sm); font-size:14px; font-weight:600; white-space:nowrap;
  background:var(--o-hover); color:var(--o-text); border:1px solid var(--o-line); transition:background .12s, border-color .12s; }
.vanta-btn:hover { background:var(--background-mod-normal,rgba(150,150,160,.16)); border-color:var(--o-line-strong); }
.vanta-btn.primary { background:var(--vanta-accent); border-color:transparent; color:#fff; }
.vanta-btn.primary:hover { background:var(--vanta-accent-hover); }
.vanta-btn.danger { background:transparent; color:var(--o-danger); border-color:color-mix(in srgb,var(--o-danger) 45%,transparent); }
.vanta-btn.danger:hover { background:color-mix(in srgb,var(--o-danger) 12%,transparent); }
.vanta-btn.danger.solid { background:var(--o-danger); color:#fff; border-color:transparent; }
.vanta-btn.ghost { background:transparent; border-color:transparent; color:var(--o-muted); }
.vanta-btn.ghost:hover { background:var(--o-hover); color:var(--o-text); }
.vanta-btn.small { height:30px; padding:0 10px; font-size:13px; }
.vanta-btn.icon-only { width:32px; height:32px; padding:0; }
.vanta-btn:disabled, .vanta-btn[aria-disabled=true] { opacity:.5; cursor:not-allowed; }
.vanta-btn svg { flex-shrink:0; }
.vanta-scope :is(.vanta-btn,.vanta-switch,.vanta-tab,.vanta-chip):focus-visible { outline:2px solid var(--vanta-accent); outline-offset:2px; }
.vanta-btns { display:flex; flex-wrap:wrap; gap:8px; }
.vanta-input { width:100%; height:40px; padding:0 12px; border-radius:var(--o-r-sm); border:1px solid var(--o-line-strong);
  background:var(--o-input); color:var(--o-text); font:inherit; font-size:14px; outline:none; }
.vanta-input:focus { border-color:var(--vanta-accent); }
.vanta-input-wrap { position:relative; flex:1; min-width:180px; }
.vanta-input-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--o-muted); pointer-events:none; }
.vanta-input-wrap .vanta-input { padding-left:38px; }
.vanta-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.vanta-segment { display:inline-flex; padding:3px; gap:2px; border-radius:var(--o-r-sm); background:var(--o-input); border:1px solid var(--o-line); }
.vanta-chip { all:unset; cursor:pointer; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600; color:var(--o-muted); }
.vanta-chip:hover { color:var(--o-text); }
.vanta-chip[aria-pressed=true] { background:var(--o-hover); color:var(--o-strong); }
.vanta-tabs { display:flex; gap:4px; border-bottom:1px solid var(--o-line); }
.vanta-tab { all:unset; cursor:pointer; padding:10px 12px; margin-bottom:-1px; font-size:14px; font-weight:600; color:var(--o-muted);
  border-bottom:2px solid transparent; }
.vanta-tab:hover { color:var(--o-text); }
.vanta-tab[aria-selected=true] { color:var(--o-strong); border-bottom-color:var(--vanta-accent); }
.vanta-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
.vanta-item { display:flex; flex-direction:column; gap:10px; padding:14px 16px; transition:border-color .12s; }
.vanta-item:hover { border-color:var(--o-line-strong); }
.vanta-item.on { border-color:color-mix(in srgb,var(--vanta-accent) 40%,var(--o-line)); }
.vanta-item-top { display:flex; align-items:flex-start; gap:12px; }
.vanta-item-name { flex:1; min-width:0; font-size:15px; line-height:20px; font-weight:600; color:var(--o-strong);
  display:flex; align-items:center; gap:6px; flex-wrap:wrap; overflow-wrap:anywhere; }
.vanta-item-desc { font-size:13px; line-height:18px; color:var(--o-muted); overflow-wrap:anywhere; }
.vanta-item-foot { display:flex; align-items:center; gap:8px; margin-top:auto; font-size:12px; color:var(--o-muted); }
.vanta-item-foot .vanta-spacer { flex:1; }
.vanta-tag { display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:4px; font-size:11px;
  font-weight:700; letter-spacing:.02em; background:var(--vanta-accent-soft); color:#c4b5fd; }
.vanta-tag.danger { background:color-mix(in srgb,var(--o-danger) 16%,transparent); color:var(--o-danger); }
.vanta-tag.ok { background:color-mix(in srgb,var(--o-ok) 16%,transparent); color:var(--o-ok); }
.vanta-tag.warn { background:color-mix(in srgb,var(--o-warn) 16%,transparent); color:var(--o-warn); }
.vanta-empty { padding:36px 20px; text-align:center; color:var(--o-muted); font-size:14px; line-height:20px;
  border:1px dashed var(--o-line-strong); border-radius:var(--o-r-md); display:flex; flex-direction:column; align-items:center; gap:12px; }
.vanta-empty svg { opacity:.6; }
.vanta-theme-grid { grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); }
.vanta-theme-card { overflow:hidden; }
.vanta-theme-thumb { display:block; margin:-14px -16px 2px; width:calc(100% + 32px); aspect-ratio:16/9; object-fit:cover;
  background:var(--o-input); border-bottom:1px solid var(--o-line); }
.vanta-badge { display:inline-flex; align-items:center; gap:4px; height:18px; padding:0 6px; border-radius:4px; font-size:11px; font-weight:700; }
.vanta-badge.official { background:color-mix(in srgb,var(--o-ok) 18%,transparent); color:var(--o-ok); }
.vanta-badge.community { background:var(--o-hover); color:var(--o-muted); }
.vanta-badge.impostor { background:color-mix(in srgb,var(--o-danger) 16%,transparent); color:var(--o-danger); }
.vanta-code { font-family:var(--font-code,Consolas,monospace); font-size:12.5px; }
.vanta-kv { display:grid; grid-template-columns:auto 1fr; gap:8px 20px; font-size:14px; }
.vanta-kv dt { color:var(--o-muted); }
.vanta-kv dd { margin:0; color:var(--o-text); overflow-wrap:anywhere; }
.vanta-editor { width:100%; min-height:420px; resize:vertical; padding:14px 16px; border-radius:var(--o-r-md);
  border:1px solid var(--o-line-strong); background:var(--o-input); color:var(--o-text); outline:none; tab-size:4;
  font:13px/1.6 var(--font-code,Consolas,monospace); white-space:pre; }
.vanta-editor:focus { border-color:var(--vanta-accent); }
.vanta-hero { display:flex; gap:18px; align-items:center; padding:20px; position:relative; overflow:hidden; }
.vanta-hero::before { content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(120% 140% at 0% 0%, rgba(139,92,246,.22), transparent 55%); }
.vanta-hero > * { position:relative; }
.vanta-hero-title { font-size:22px; font-weight:800; color:var(--o-strong); letter-spacing:.01em; }
.vanta-hero-sub { font-size:13px; color:var(--o-muted); margin-top:2px; }
.vanta-stats { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.vanta-stat { padding:4px 10px; border-radius:999px; background:var(--o-hover); font-size:12px; font-weight:600; color:var(--o-text); }
.vanta-stat b { color:#c4b5fd; }
.vanta-list { display:flex; flex-direction:column; gap:8px; }
.vanta-commit { display:flex; gap:12px; align-items:baseline; padding:10px 14px; font-size:14px; }
.vanta-commit code { color:#c4b5fd; }
.vanta-commit .vanta-row-desc { margin:0; white-space:nowrap; }
.vanta-note { display:flex; gap:12px; padding:14px 16px; border-radius:var(--o-r-md); font-size:14px; line-height:20px;
  background:var(--vanta-accent-soft); border:1px solid color-mix(in srgb,var(--vanta-accent) 35%,transparent); }
.vanta-note.warn { background:color-mix(in srgb,var(--o-warn) 10%,transparent); border-color:color-mix(in srgb,var(--o-warn) 35%,transparent); }
.vanta-note.danger { background:color-mix(in srgb,var(--o-danger) 10%,transparent); border-color:color-mix(in srgb,var(--o-danger) 35%,transparent); }
.vanta-note svg { flex-shrink:0; margin-top:1px; }
.vanta-note code { font-family:var(--font-code,Consolas,monospace); font-size:12.5px; padding:1px 4px; border-radius:4px; background:var(--o-hover); }
.vanta-modal-back { position:fixed; inset:0; z-index:100002; display:grid; place-items:center; padding:24px;
  background:rgba(0,0,0,.6); animation:vanta-fade .12s ease-out; }
.vanta-modal { width:min(580px,100%); max-height:85vh; overflow:auto; background:var(--background-base-low,#1f1f24);
  border:1px solid var(--o-line); border-radius:var(--o-r-md); box-shadow:0 20px 60px rgba(0,0,0,.5);
  animation:vanta-rise .16s ease-out; }
.vanta-modal-head { padding:20px 20px 4px; font-size:20px; font-weight:700; color:var(--o-strong); }
.vanta-modal-body { padding:8px 20px 20px; font-size:14px; line-height:20px; color:var(--o-text); display:flex; flex-direction:column; gap:12px; }
.vanta-modal-foot { padding:14px 20px; display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--o-line);
  background:var(--o-hover); }
@keyframes vanta-fade { from { opacity:0 } }
@keyframes vanta-rise { from { opacity:0; transform:translateY(6px) scale(.985) } }
#vanta-toasts { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:100003; display:flex;
  flex-direction:column; gap:8px; align-items:center; pointer-events:none; }
.vanta-toast { pointer-events:auto; display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:var(--o-r-sm);
  background:var(--background-surface-higher,#2b2b31); color:var(--o-text); border:1px solid var(--o-line-strong);
  box-shadow:0 10px 30px rgba(0,0,0,.45); font-size:14px; font-weight:500; animation:vanta-rise .18s ease-out; transition:opacity .25s; }
.vanta-toast svg { color:var(--vanta-accent); }
.vanta-toast.danger svg { color:var(--o-danger); }
.vanta-toast.ok svg { color:var(--o-ok); }
@media (prefers-reduced-motion: reduce) { .vanta-scope *, .vanta-toast, .vanta-modal, .vanta-modal-back { animation:none !important; transition:none !important; } }
`;
