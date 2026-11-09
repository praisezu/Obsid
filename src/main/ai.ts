/*
 * A small, locked-down bridge to Anthropic's Claude API for plugins that chat (like Capri).
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

export function createAi(dataDir: string) {
    const keyFile = path.join(dataDir, "ai-key.bin");
    const key = () => { try { return safeStorage.decryptString(fs.readFileSync(keyFile)); } catch { return null; } };

    return {
        hasKey: () => !!key(),
        setKey(k: string | null) {
            if (!k) { try { fs.unlinkSync(keyFile); } catch { } return false; }
            k = String(k).trim();
            if (!/^sk-ant-[\w-]{20,}$/.test(k)) throw new Error("That doesn't look like an Anthropic API key (they start with sk-ant-).");
            if (!safeStorage.isEncryptionAvailable()) throw new Error("Your system can't encrypt the key, so Vanta won't store it.");
            fs.writeFileSync(keyFile, safeStorage.encryptString(k));
            return true;
        },
        async chat(system: string, messages: AiMessage[], maxTokens = 200): Promise<string> {
            const k = key();
            if (!k) throw new Error("No API key set");
            const clean = (Array.isArray(messages) ? messages : []).slice(-20)
                .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
                .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
            if (!clean.length || clean[0].role !== "user") throw new Error("A chat has to start with a user message");
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
