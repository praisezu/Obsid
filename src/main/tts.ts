/*
 * Capri's own voice: the Kokoro-82M speech model with her custom voice (speaker 53 of the Capri Desktop voice pack,
 * https://github.com/lachydotmcg/capri-desktop, PolyForm Noncommercial 1.0.0; Kokoro is Apache-2.0).
 *
 * - Her voice (0.5 MB) is cut out of the pack's voices.bin with HTTP range requests, so the 316 MB pack is never downloaded.
 * - The model runs with kokoro-js (pinned version, checked with a sha384 hash) in a hidden window that has no Node access,
 *   its own session, and only a tiny bridge back to here. Model files are downloaded once and kept in %APPDATA%\Vanta\voice.
 * - The window closes itself after a while unused, to give the memory back.
 */
import { BrowserWindow, ipcMain, type WebContents } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const PACK_URL = "https://github.com/lachydotmcg/capri-desktop/releases/download/voice-pack-1/capri-voice-1.zip";
// voices.bin inside the pack: where it starts, its compressed and full size, and her place in it
const VOICES = { offset: 313558476, csize: 1952325, usize: 28200960 };
const SPEAKER = 53, STYLE_BYTES = 510 * 256 * 4;

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const KOKORO_SRI = "sha384-suR1TeKe6Fe8fT0n/uTWoohnPJrp1zu3z0bj4VH2anmmq739wlmFSnMFJyMYszAC";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const HF = `https://huggingface.co/${MODEL}/resolve/main/`;
const IDLE_CLOSE = 10 * 60_000;

const PAGE = `<!doctype html><meta charset="utf-8"><title>Vanta voice</title>
<script type="importmap">${JSON.stringify({ imports: { kokoro: KOKORO_URL }, integrity: { [KOKORO_URL]: KOKORO_SRI } })}</script>
<script type="module">
const host = window.vantaVoice;
const HF = ${JSON.stringify(HF)};
const realFetch = window.fetch.bind(window);
// Model files and her voice come from Vanta's disk cache, not the network every time
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith(HF + "voices/")) return new Response(await host.voice(), { headers: { "content-type": "application/octet-stream" } });
  if (url.startsWith(HF)) {
    const buf = await host.file(url);
    if (!buf) return new Response(null, { status: 404 });
    return new Response(buf, { headers: { "content-type": url.endsWith(".json") ? "application/json" : "application/octet-stream", "content-length": String(buf.byteLength) } });
  }
  return realFetch(input, init);
};
try {
  const { KokoroTTS } = await import("kokoro");
  const tts = await KokoroTTS.from_pretrained(${JSON.stringify(MODEL)}, { dtype: "q8", device: "wasm" });
  host.onSpeak(async (id, text, speed) => {
    try { const a = await tts.generate(text, { voice: "af_heart", speed }); host.done(id, a.audio, a.sampling_rate); }
    catch (e) { host.fail(id, String(e && e.message || e)); }
  });
  host.ready();
} catch (e) { host.broken(String(e && e.message || e)); }
</script>`;

const PRELOAD = `const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vantaVoice", {
  voice: () => ipcRenderer.invoke("vanta-voice:voice"),
  file: url => ipcRenderer.invoke("vanta-voice:file", url),
  ready: () => ipcRenderer.send("vanta-voice:ready"),
  broken: msg => ipcRenderer.send("vanta-voice:broken", msg),
  done: (id, audio, rate) => ipcRenderer.send("vanta-voice:done", id, audio, rate),
  fail: (id, msg) => ipcRenderer.send("vanta-voice:fail", id, msg),
  onSpeak: fn => ipcRenderer.on("vanta-voice:speak", (_, id, text, speed) => fn(id, text, speed)),
});`;

async function rangeOf(url: string, from: number, to: number) {
    const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, redirect: "follow" });
    if (res.status !== 206) throw new Error(`Range request failed (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

export function createVoice(dataDir: string) {
    const dir = path.join(dataDir, "voice");
    const cacheDir = path.join(dir, "model");
    const voiceFile = path.join(dir, "capri-voice.bin");
    fs.mkdirSync(cacheDir, { recursive: true });

    let win: BrowserWindow | null = null;
    let ready: Promise<WebContents> | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: { audio: Float32Array; rate: number }) => void; reject: (e: Error) => void }>();
    let status = "off";

    /** Cuts her voice out of the pack's voices.bin (one-time, ~2 MB download) */
    async function herVoice(): Promise<Buffer> {
        if (fs.existsSync(voiceFile)) return fs.readFileSync(voiceFile);
        const head = await rangeOf(PACK_URL, VOICES.offset, VOICES.offset + 29);
        if (head.readUInt32LE(0) !== 0x04034b50) throw new Error("The Capri voice pack changed; her voice couldn't be found.");
        const start = VOICES.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
        const all = zlib.inflateRawSync(await rangeOf(PACK_URL, start, start + VOICES.csize - 1));
        if (all.length !== VOICES.usize) throw new Error("The Capri voice pack changed; her voice couldn't be read.");
        const mine = Buffer.from(all.subarray(SPEAKER * STYLE_BYTES, (SPEAKER + 1) * STYLE_BYTES));
        fs.writeFileSync(voiceFile, mine);
        return mine;
    }

    /** Model files, downloaded once into %APPDATA%\Vanta\voice\model */
    async function modelFile(url: string): Promise<Buffer | null> {
        if (!url.startsWith(HF)) return null;
        const rel = url.slice(HF.length).split("?")[0];
        if (!/^[\w./-]+$/.test(rel) || rel.includes("..")) return null;
        const file = path.join(cacheDir, rel.replace(/\//g, "__"));
        if (fs.existsSync(file)) return fs.readFileSync(file);
        status = "downloading";
        const res = await fetch(HF + rel, { redirect: "follow" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Downloading her voice model failed (HTTP ${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(file + ".part", buf);
        fs.renameSync(file + ".part", file);
        return buf;
    }

    const fromVoiceWindow = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => !!win && e.sender === win.webContents;
    ipcMain.handle("vanta-voice:voice", e => fromVoiceWindow(e) ? herVoice() : null);
    ipcMain.handle("vanta-voice:file", (e, url) => fromVoiceWindow(e) ? modelFile(String(url)) : null);
    ipcMain.on("vanta-voice:done", (e, id, audio, rate) => {
        if (!fromVoiceWindow(e)) return;
        pending.get(id)?.resolve({ audio, rate }); pending.delete(id);
    });
    ipcMain.on("vanta-voice:fail", (e, id, msg) => {
        if (!fromVoiceWindow(e)) return;
        pending.get(id)?.reject(new Error(String(msg))); pending.delete(id);
    });

    function close() {
        clearTimeout(idle);
        win?.destroy(); win = null; ready = null; status = "off";
        for (const p of pending.values()) p.reject(new Error("Her voice stopped"));
        pending.clear();
    }

    function open(): Promise<WebContents> {
        if (ready) return ready;
        ready = new Promise((resolve, reject) => {
            fs.writeFileSync(path.join(dir, "voice.html"), PAGE);
            fs.writeFileSync(path.join(dir, "preload.js"), PRELOAD);
            status = "starting";
            win = new BrowserWindow({
                show: false, width: 200, height: 200, skipTaskbar: true,
                webPreferences: {
                    preload: path.join(dir, "preload.js"), partition: "persist:vanta-voice",
                    contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
                },
            });
            const onReady = (e: Electron.IpcMainEvent) => { if (fromVoiceWindow(e)) { cleanup(); status = "ready"; resolve(win!.webContents); } };
            const onBroken = (e: Electron.IpcMainEvent, msg: string) => { if (fromVoiceWindow(e)) { cleanup(); close(); status = "error"; reject(new Error("Her voice couldn't start: " + msg)); } };
            const cleanup = () => { ipcMain.removeListener("vanta-voice:ready", onReady); ipcMain.removeListener("vanta-voice:broken", onBroken); };
            ipcMain.on("vanta-voice:ready", onReady);
            ipcMain.on("vanta-voice:broken", onBroken);
            win.on("closed", () => { win = null; ready = null; });
            win.loadFile(path.join(dir, "voice.html")).catch(e => { cleanup(); close(); reject(e); });
        });
        return ready;
    }

    return {
        status: () => status,
        async speak(text: string, speed = 1.1): Promise<{ audio: Float32Array; rate: number }> {
            text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
            if (!text) throw new Error("Nothing to say");
            const wc = await open();
            clearTimeout(idle);
            idle = setTimeout(close, IDLE_CLOSE);
            const id = nextId++;
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                wc.send("vanta-voice:speak", id, text, Math.max(0.6, Math.min(1.6, Number(speed) || 1.1)));
                setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("She took too long to speak")); } }, 120_000);
            });
        },
        close,
        /** For checking the download without starting the model */
        sha: () => fs.existsSync(voiceFile) ? crypto.createHash("sha256").update(fs.readFileSync(voiceFile)).digest("hex") : null,
    };
}
