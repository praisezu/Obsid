/*
 * Main-process helpers for plugins:
 * - saveFiles: saves Discord-hosted media with its real filename (only Discord's CDN, nothing else)
 * - muteOverlay: a tiny always-on-top, click-through indicator showing when you're muted or deafened
 */
import { BrowserWindow, dialog, screen, app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

const DISCORD_CDN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net)\//i;
const safe = (n: string) => (String(n || "file").replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").slice(0, 120) || "file");

function unique(dir: string, name: string) {
    const ext = path.extname(name), base = path.basename(name, ext);
    let file = path.join(dir, name), i = 1;
    while (fs.existsSync(file)) file = path.join(dir, `${base} (${i++})${ext}`);
    return file;
}

async function download(url: string) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

export async function saveFiles(win: BrowserWindow | null, files: { url: string; name: string }[]): Promise<number> {
    const list = (Array.isArray(files) ? files : []).filter(f => DISCORD_CDN.test(String(f?.url))).slice(0, 500);
    if (!list.length) throw new Error("Only files hosted by Discord can be saved this way");
    if (list.length === 1) {
        const r = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath("downloads"), safe(list[0].name)) });
        if (r.canceled || !r.filePath) return 0;
        fs.writeFileSync(r.filePath, await download(list[0].url));
        return 1;
    }
    const r = await dialog.showOpenDialog(win!, { title: `Save ${list.length} files to…`, defaultPath: app.getPath("downloads"), properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return 0;
    let n = 0;
    for (const f of list) { // one at a time: gentle on Discord's CDN
        try { fs.writeFileSync(unique(r.filePaths[0], safe(f.name)), await download(f.url)); n++; } catch { /* skip that one */ }
    }
    return n;
}

let overlay: BrowserWindow | null = null;
export function muteOverlay(state: string, corner: string) {
    if (state !== "muted" && state !== "deafened") { overlay?.hide(); return; }
    const W = 132, H = 38;
    if (!overlay || overlay.isDestroyed()) {
        overlay = new BrowserWindow({
            width: W, height: H, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
            skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        overlay.setAlwaysOnTop(true, "screen-saver");
        overlay.setIgnoreMouseEvents(true);
        overlay.setVisibleOnAllWorkspaces?.(true);
    }
    const area = screen.getPrimaryDisplay().workArea, m = 16;
    const x = corner.endsWith("left") ? area.x + m : area.x + area.width - W - m;
    const y = corner.startsWith("bottom") ? area.y + area.height - H - m : area.y + m;
    overlay.setBounds({ x, y, width: W, height: H });
    const label = state === "deafened" ? "Deafened" : "Muted";
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent;font:600 14px Segoe UI,system-ui,sans-serif">
<div style="display:flex;align-items:center;gap:8px;height:${H}px;padding:0 14px;box-sizing:border-box;border-radius:19px;background:rgba(15,15,20,.86);color:#fff;border:1px solid rgba(237,66,69,.7)">
<span style="width:10px;height:10px;border-radius:50%;background:#ed4245;box-shadow:0 0 8px #ed4245"></span>${label}</div></body>`;
    overlay.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html)).then(() => overlay?.showInactive()).catch(() => { });
}

export function closeOverlay() { overlay?.destroy(); overlay = null; }
