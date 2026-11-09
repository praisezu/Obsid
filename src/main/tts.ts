/*
 * Capri's engine, running on this PC: her own voice and her offline brain.
 *
 * Voice: the Kokoro-82M speech model with her custom voice (speaker 53 of the Capri Desktop voice pack,
 * https://github.com/lachydotmcg/capri-desktop, PolyForm Noncommercial 1.0.0; Kokoro is Apache-2.0). Her voice (0.5 MB)
 * is cut out of the pack's voices.bin with HTTP range requests, so the 316 MB pack is never downloaded.
 *
 * Brain: Qwen2.5-0.5B-Instruct (Apache-2.0), a small chat model that answers every time, offline, with no key and no
 * rate limits. Loaded only the first time it's needed.
 *
 * Both run with pinned, hash-checked libraries (kokoro-js, transformers.js) in a hidden window that has no Node access,
 * its own session and a tiny bridge back to here. The page is served at a made-up https address with cross-origin
 * isolation, which lets the models use several CPU threads. Model files download once into %APPDATA%\Vanta\voice\models
 * and are streamed from disk after that. The window closes itself after a while unused, to give the memory back.
 */
import { BrowserWindow, ipcMain, session, type WebContents } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { Readable } from "node:stream";

const PACK_URL = "https://github.com/lachydotmcg/capri-desktop/releases/download/voice-pack-1/capri-voice-1.zip";
// voices.bin inside the pack: where it starts, its compressed and full size, and her place in it
const VOICES = { offset: 313558476, csize: 1952325, usize: 28200960 };
const SPEAKER = 53, STYLE_BYTES = 510 * 256 * 4;

const LIBS = {
    kokoro: { url: "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js", sri: "sha384-suR1TeKe6Fe8fT0n/uTWoohnPJrp1zu3z0bj4VH2anmmq739wlmFSnMFJyMYszAC" },
    transformers: { url: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js", sri: "sha384-sOua6i337lNLWtuIG44PBf5JXIvhoicFClCcI4XHDe/eHW3dwhQ3Y6t6wQjfRrkT" },
};
const VOICE_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const BRAIN_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
/** The only model repos the engine may download from */
const MODELS = [VOICE_MODEL, BRAIN_MODEL];
const HF_ROOT = "https://huggingface.co/";
const IDLE_CLOSE = 30 * 60_000;
const PAGE_ORIGIN = "https://vanta-voice.invalid";

const PAGE = `<!doctype html><meta charset="utf-8"><title>Vanta engine</title>
<script type="importmap">${JSON.stringify({
    imports: { kokoro: LIBS.kokoro.url, transformers: LIBS.transformers.url },
    integrity: { [LIBS.kokoro.url]: LIBS.kokoro.sri, [LIBS.transformers.url]: LIBS.transformers.sri },
})}</script>
<script type="module">
const host = window.vantaVoice;
const VOICES = ${JSON.stringify(`${HF_ROOT}${VOICE_MODEL}/resolve/main/voices/`)};
const realFetch = window.fetch.bind(window);
// Her voice replaces the stock one the library asks for; everything else goes through Vanta's disk cache
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith(VOICES)) return new Response(await host.voice(), { headers: { "content-type": "application/octet-stream" } });
  return realFetch(input, init);
};
let brain = null;
async function getBrain() {
  if (!brain) brain = (async () => {
    const { pipeline } = await import("transformers");
    return pipeline("text-generation", ${JSON.stringify(BRAIN_MODEL)}, { dtype: "int8", device: "wasm" });
  })().catch(e => { brain = null; throw e; });
  return brain;
}
host.onChat(async (id, messages, maxTokens) => {
  try {
    const gen = await getBrain();
    const out = await gen(messages, { max_new_tokens: maxTokens, do_sample: true, temperature: 0.8, top_p: 0.9, repetition_penalty: 1.1 });
    const last = out[0].generated_text.at(-1);
    host.chatDone(id, String(last && last.content || ""));
  } catch (e) { host.chatFail(id, String(e && e.message || e)); }
});
try {
  const { KokoroTTS } = await import("kokoro");
  const tts = await KokoroTTS.from_pretrained(${JSON.stringify(VOICE_MODEL)}, { dtype: "q8", device: "wasm" });
  host.onSpeak(async (id, text, speed) => {
    try { const a = await tts.generate(text, { voice: "af_heart", speed }); host.done(id, a.audio, a.sampling_rate); }
    catch (e) { host.fail(id, String(e && e.message || e)); }
  });
  host.ready(self.crossOriginIsolated ? "threads" : "single");
} catch (e) { host.broken(String(e && e.message || e)); }
</script>`;

const PRELOAD = `const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vantaVoice", {
  voice: () => ipcRenderer.invoke("vanta-voice:voice"),
  ready: mode => ipcRenderer.send("vanta-voice:ready", mode),
  broken: msg => ipcRenderer.send("vanta-voice:broken", msg),
  done: (id, audio, rate) => ipcRenderer.send("vanta-voice:done", id, audio, rate),
  fail: (id, msg) => ipcRenderer.send("vanta-voice:fail", id, msg),
  chatDone: (id, text) => ipcRenderer.send("vanta-voice:chat-done", id, text),
  chatFail: (id, msg) => ipcRenderer.send("vanta-voice:chat-fail", id, msg),
  onSpeak: fn => ipcRenderer.on("vanta-voice:speak", (_, id, text, speed) => fn(id, text, speed)),
  onChat: fn => ipcRenderer.on("vanta-voice:chat", (_, id, messages, maxTokens) => fn(id, messages, maxTokens)),
});`;

async function rangeOf(url: string, from: number, to: number) {
    const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, redirect: "follow" });
    if (res.status !== 206) throw new Error(`Range request failed (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

type Pending<T> = Map<number, { resolve: (v: T) => void; reject: (e: Error) => void }>;

export function createVoice(dataDir: string) {
    const dir = path.join(dataDir, "voice");
    const modelsDir = path.join(dir, "models");
    const oldCache = path.join(dir, "model"); // 0.5.5 kept the voice model here
    const voiceFile = path.join(dir, "capri-voice.bin");
    fs.mkdirSync(modelsDir, { recursive: true });

    let win: BrowserWindow | null = null;
    let ready: Promise<WebContents> | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let nextId = 1;
    const speaking: Pending<{ audio: Float32Array; rate: number }> = new Map();
    const chatting: Pending<string> = new Map();
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

    /** Where a model file is kept, or null if the URL isn't one of the allowed model files */
    function cachePath(url: string): string | null {
        const repo = MODELS.find(m => url.startsWith(`${HF_ROOT}${m}/resolve/main/`));
        if (!repo) return null;
        const rel = url.slice(`${HF_ROOT}${repo}/resolve/main/`.length).split("?")[0];
        if (!/^[\w./-]+$/.test(rel) || rel.includes("..")) return null;
        const file = path.join(modelsDir, repo.replace(/\//g, "__"), rel.replace(/\//g, "__"));
        if (!fs.existsSync(file) && repo === VOICE_MODEL) { // reuse what 0.5.5 downloaded
            const old = path.join(oldCache, rel.replace(/\//g, "__"));
            if (fs.existsSync(old)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.renameSync(old, file); }
        }
        return file;
    }

    const fromEngine = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => !!win && e.sender === win.webContents;
    ipcMain.handle("vanta-voice:voice", e => fromEngine(e) ? herVoice() : null);
    ipcMain.on("vanta-voice:done", (e, id, audio, rate) => { if (fromEngine(e)) { speaking.get(id)?.resolve({ audio, rate }); speaking.delete(id); } });
    ipcMain.on("vanta-voice:fail", (e, id, msg) => { if (fromEngine(e)) { speaking.get(id)?.reject(new Error(String(msg))); speaking.delete(id); } });
    ipcMain.on("vanta-voice:chat-done", (e, id, text) => { if (fromEngine(e)) { chatting.get(id)?.resolve(String(text)); chatting.delete(id); } });
    ipcMain.on("vanta-voice:chat-fail", (e, id, msg) => { if (fromEngine(e)) { chatting.get(id)?.reject(new Error(String(msg))); chatting.delete(id); } });

    function close() {
        clearTimeout(idle);
        win?.destroy(); win = null; ready = null; status = "off";
        for (const p of [...speaking.values(), ...chatting.values()]) p.reject(new Error("Capri's engine stopped"));
        speaking.clear(); chatting.clear();
    }

    const CORS = { "cross-origin-resource-policy": "cross-origin", "access-control-allow-origin": "*" };
    let served = false;
    /** Serves the engine page with isolation headers, model files from disk, and everything else through with CORP added */
    function serve() {
        if (served) return;
        served = true;
        const ses = session.fromPartition("persist:vanta-voice");
        const log = (url: string, e: unknown) => { try { fs.appendFileSync(path.join(dir, "voice-errors.log"), `${new Date().toISOString()} ${url} ${String((e as Error)?.stack ?? e)}\n`); } catch { } };
        ses.protocol.handle("https", async req => {
            if (req.url.startsWith(PAGE_ORIGIN + "/")) {
                return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" } });
            }
            const file = req.url.startsWith(HF_ROOT) ? cachePath(req.url) : null;
            if (file && fs.existsSync(file)) {
                const size = fs.statSync(file).size;
                return new Response(Readable.toWeb(fs.createReadStream(file)) as any, { headers: { ...CORS, "content-type": file.endsWith(".json") ? "application/json" : "application/octet-stream", "content-length": String(size) } });
            }
            let res: Response;
            try { res = await ses.fetch(req.url, { method: req.method, bypassCustomProtocolHandlers: true } as any); }
            catch (e) { log(req.url, e); return new Response("Vanta engine proxy: " + String((e as Error)?.message ?? e), { status: 502, headers: CORS }); }
            const headers = new Headers(res.headers);
            for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
            // the body was already decompressed, so these would make the page try to decode it again
            headers.delete("content-encoding");
            headers.delete("content-length");
            if (file && res.ok && res.body) {
                // First download of a model file: save it to disk while handing it to the page
                status = "downloading";
                const [toPage, toDisk] = res.body.tee();
                fs.mkdirSync(path.dirname(file), { recursive: true });
                const part = file + ".part";
                const out = fs.createWriteStream(part);
                Readable.fromWeb(toDisk as any).pipe(out)
                    .on("finish", () => { try { fs.renameSync(part, file); } catch (e) { log(req.url, e); } })
                    .on("error", e => { log(req.url, e); try { fs.unlinkSync(part); } catch { } });
                return new Response(toPage, { status: res.status, statusText: res.statusText, headers });
            }
            return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
        });
    }

    function open(): Promise<WebContents> {
        if (ready) return ready;
        ready = new Promise((resolve, reject) => {
            fs.writeFileSync(path.join(dir, "preload.js"), PRELOAD);
            serve();
            status = "starting";
            win = new BrowserWindow({
                show: false, width: 200, height: 200, skipTaskbar: true,
                webPreferences: {
                    preload: path.join(dir, "preload.js"), partition: "persist:vanta-voice",
                    contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
                },
            });
            const onReady = (e: Electron.IpcMainEvent, mode: string) => { if (fromEngine(e)) { cleanup(); status = "ready (" + mode + ")"; resolve(win!.webContents); } };
            const onBroken = (e: Electron.IpcMainEvent, msg: string) => {
                if (!fromEngine(e)) return;
                cleanup(); ready = null; status = "error";
                const broken = win; win = null;
                setTimeout(() => broken?.destroy(), 30_000); // left open briefly so it can be inspected
                reject(new Error("Capri's engine couldn't start: " + msg));
            };
            const cleanup = () => { ipcMain.removeListener("vanta-voice:ready", onReady); ipcMain.removeListener("vanta-voice:broken", onBroken); };
            ipcMain.on("vanta-voice:ready", onReady);
            ipcMain.on("vanta-voice:broken", onBroken);
            win.on("closed", () => { win = null; ready = null; });
            win.loadURL(PAGE_ORIGIN + "/engine.html").catch(e => { cleanup(); close(); reject(e); });
        });
        return ready;
    }

    async function use() {
        const wc = await open();
        clearTimeout(idle);
        idle = setTimeout(close, IDLE_CLOSE);
        return wc;
    }

    return {
        status: () => status,
        /** Loads the voice model ahead of time, so her first line isn't slow */
        async warm() { await use(); return status; },
        async speak(text: string, speed = 1.1): Promise<{ audio: Float32Array; rate: number }> {
            text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
            if (!text) throw new Error("Nothing to say");
            const wc = await use();
            const id = nextId++;
            return new Promise((resolve, reject) => {
                speaking.set(id, { resolve, reject });
                wc.send("vanta-voice:speak", id, text, Math.max(0.6, Math.min(1.6, Number(speed) || 1.1)));
                setTimeout(() => { if (speaking.has(id)) { speaking.delete(id); reject(new Error("She took too long to speak")); } }, 120_000);
            });
        },
        /** Her offline brain. The first time, the model (about 500 MB) downloads, so that answer takes a while. */
        async chat(messages: { role: string; content: string }[], maxTokens = 70): Promise<string> {
            const wc = await use();
            const id = nextId++;
            return new Promise((resolve, reject) => {
                chatting.set(id, { resolve, reject });
                wc.send("vanta-voice:chat", id, messages, Math.max(16, Math.min(200, maxTokens)));
                setTimeout(() => { if (chatting.has(id)) { chatting.delete(id); reject(new Error("Her brain took too long")); } }, 10 * 60_000);
            });
        },
        close,
    };
}
