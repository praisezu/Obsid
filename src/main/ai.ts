/*
 * A small, locked-down chat bridge for plugins (like Capri): Claude with the user's key, or a free keyless brain.
 *
 * The API key is encrypted with Electron's safeStorage (DPAPI on Windows) and never leaves the main
 * process: plugins can ask whether one is set and send a chat, but can't read it. Requests only ever go
 * to api.anthropic.com, with capped sizes, so a plugin can't use this to talk to anything else.
 */
import { safeStorage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-5-5";

export interface AiMessage { role: "user" | "assistant"; content: string }

/**
 * Without a key: Pollinations' free, anonymous text API (no account, no key). Only that host is ever called.
 * Replies are trimmed to the answer itself (no reasoning, no sponsor lines).
 */
const FREE_HOST = "https://text.pollinations.ai";

/** Keeps only her answer: drops anything after a divider, sponsor lines, and stray quotes or "Capri:" labels */
function tidy(text: string) {
    text = String(text || "").split(/\n\s*(-{3,}|\*{3,})\s*\n/)[0];
    text = text.split("\n").filter(l => !/pollinations|sponsor|powered by/i.test(l)).join(" ");
    return text.replace(/^\s*(capri\s*:)\s*/i, "").replace(/^"(.*)"$/s, "$1").replace(/\s+/g, " ").trim();
}

async function freeOnce(system: string, messages: AiMessage[], timeout: number): Promise<string> {
    const res = await fetch(FREE_HOST + "/openai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "openai", messages: [{ role: "system", content: system }, ...messages] }),
        signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const text = tidy(data?.choices?.[0]?.message?.content ?? "");
    if (!text) throw new Error("empty reply"); // e.g. it only "thought" and never answered
    return text;
}

/** Something that answers on this PC (Capri's offline brain): no limits, no key */
export type LocalBrain = (messages: { role: string; content: string }[], maxTokens: number) => Promise<string>;

/** A small model works best with a short prompt: the start of her personality plus the notes about right now */
function compact(system: string) {
    const at = system.indexOf("\nWhere you are now:");
    const tail = at >= 0 ? system.slice(at) : "";
    const head = system.slice(0, at >= 0 ? Math.min(at, 1400) : 1400);
    return head.replace(/\s+\S*$/, "") + tail + "\nReply with one short line, under 25 words, plain text, in character.";
}

/**
 * Without a key: Pollinations' free, anonymous API (no account, no key) when it allows it (one reply every 45 seconds per
 * network), and otherwise Capri's offline brain on this PC, so she always answers.
 */
let lastFree = 0;
async function freeChat(system: string, messages: AiMessage[], local: LocalBrain | null, online: boolean): Promise<string> {
    if (online && Date.now() - lastFree > 46_000) {
        lastFree = Date.now();
        try { return await freeOnce(system, messages, 15_000); } catch { /* busy or limited: answer offline */ }
    }
    if (!local) throw new Error("The free brain is busy. Try again in a bit.");
    const text = tidy(await local([{ role: "system", content: compact(system) }, ...messages.slice(-8)], 70));
    if (!text) throw new Error("Her brain didn't answer");
    return text;
}

/**
 * NVIDIA's API (build.nvidia.com, free credits with your own key). Nemotron 3.5 Lightning with "thinking" off answers
 * in well under a second and stays sharp. Only integrate.api.nvidia.com is called.
 */
const NV_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const NV_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
async function nvidiaChat(k: string, system: string, messages: AiMessage[], maxTokens: number): Promise<string> {
    const res = await fetch(NV_API, {
        method: "POST",
        headers: { authorization: `Bearer ${k}`, "content-type": "application/json" },
        body: JSON.stringify({
            model: NV_MODEL, max_tokens: Math.max(16, Math.min(400, Number(maxTokens) || 200)), temperature: 0.9, top_p: 0.95,
            chat_template_kwargs: { enable_thinking: false },
            messages: [{ role: "system", content: system }, ...messages],
        }),
        signal: AbortSignal.timeout(25_000),
    }).catch(e => { throw new Error(/timeout|abort/i.test(String(e?.name ?? e)) ? "NVIDIA took too long to answer." : "Couldn't reach NVIDIA: " + (e?.message ?? e)); });
    if (res.status === 401 || res.status === 403) throw new Error("NVIDIA rejected the API key. Make a new one at build.nvidia.com and paste it in Capri's settings.");
    if (res.status === 402) throw new Error("Your NVIDIA key is out of free credits.");
    if (res.status === 429) throw new Error("NVIDIA says too many requests right now. Try again in a minute.");
    if (!res.ok) {
        const detail = await res.text().then(t => { try { const j = JSON.parse(t); return j.detail ?? j.error?.message ?? j.message ?? t; } catch { return t; } }).catch(() => "");
        throw new Error(`NVIDIA returned HTTP ${res.status}${detail ? ": " + String(detail).slice(0, 160) : ""}`);
    }
    const data: any = await res.json();
    const text = tidy(data?.choices?.[0]?.message?.content ?? "");
    if (!text) throw new Error("NVIDIA didn't answer");
    return text;
}

export function createAi(dataDir: string, local: LocalBrain | null = null) {
    const keyFile = path.join(dataDir, "ai-key.bin");
    const nvFile = path.join(dataDir, "nvidia-key.bin");
    const read = (file: string) => { try { return safeStorage.decryptString(fs.readFileSync(file)); } catch { return null; } };
    const key = () => read(keyFile);
    const nvKey = () => read(nvFile);

    return {
        hasKey: () => !!key() || !!nvKey(),
        /** Which brains have a key */
        keys: () => ({ claude: !!key(), nvidia: !!nvKey() }),
        /** Saves a Claude (sk-ant-…) or NVIDIA (nvapi-…) key, encrypted. null removes both. */
        setKey(k: string | null) {
            if (!k) { for (const f of [keyFile, nvFile]) try { fs.unlinkSync(f); } catch { } return false; }
            k = String(k).trim();
            const file = /^sk-ant-[\w-]{20,}$/.test(k) ? keyFile : /^nvapi-[\w-]{20,}$/.test(k) ? nvFile : null;
            if (!file) throw new Error("That doesn't look like a Claude key (sk-ant-…) or an NVIDIA key (nvapi-…).");
            if (!safeStorage.isEncryptionAvailable()) throw new Error("Your system can't encrypt the key, so Vanta won't store it.");
            fs.writeFileSync(file, safeStorage.encryptString(k));
            return true;
        },
        /** mode: without a key, "online" may use the free online brain; anything else stays on this PC */
        async chat(system: string, messages: AiMessage[], maxTokens = 200, mode = "offline"): Promise<string> {
            const clean = (Array.isArray(messages) ? messages : []).slice(-20)
                .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
                .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
            while (clean.length && clean[0].role !== "user") clean.shift();
            if (!clean.length) throw new Error("A chat has to start with a user message");
            const k = key();
            if (!k) {
                const nv = nvKey();
                if (nv) {
                    let nvErr: Error;
                    try { return await nvidiaChat(nv, String(system).slice(0, 12000), clean, maxTokens); }
                    catch (e) { nvErr = e as Error; if (/rejected|credits/.test(nvErr.message)) throw nvErr; }
                    // NVIDIA had a hiccup: try the free brains, and if they can't answer either, say why NVIDIA didn't
                    try { return await freeChat(String(system).slice(0, 8000), clean, local, mode === "online"); }
                    catch { throw nvErr; }
                }
                return freeChat(String(system).slice(0, 8000), clean, local, mode === "online");
            }
            const res = await fetch(API, {
                method: "POST",
                headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
                body: JSON.stringify({ model: MODEL, max_tokens: Math.max(16, Math.min(400, Number(maxTokens) || 200)), system: String(system).slice(0, 6000), messages: clean }),
            });
            if (res.status === 401) throw new Error("Anthropic rejected the API key.");
            if (res.status === 429) throw new Error("Too many requests right now. Try again in a bit.");
            if (!res.ok) throw new Error(`Anthropic returned HTTP ${res.status}`);
            const data: any = await res.json();
            return (data?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("").trim();
        },
    };
}
