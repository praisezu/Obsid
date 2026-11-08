/**
 * Small persistent storage for plugins (JSON files in %APPDATA%/Vanta/plugin-data/).
 *   const saved = await storage.get<MyData>("MyPlugin");
 *   storage.set("MyPlugin", data);   // debounced write
 */
import { native } from "./native";

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, unknown>();

function flush(key: string) {
    if (!pending.has(key)) return;
    const value = pending.get(key);
    pending.delete(key);
    return native.dataSet(key, value);
}

export const storage = {
    get: <T = any>(key: string) => native.dataGet<T>(key),
    /** Saves after `delay` ms of no further changes (default 1.5s). */
    set(key: string, value: unknown, delay = 1500) {
        pending.set(key, value);
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => flush(key), delay));
    },
    /** Saves right away. */
    setNow(key: string, value: unknown) {
        clearTimeout(timers.get(key));
        pending.delete(key);
        return native.dataSet(key, value);
    },
};

// Don't lose pending writes when Discord reloads or closes.
addEventListener("beforeunload", () => { for (const key of [...pending.keys()]) flush(key); });
