/*
 * Plugin health: which plugin owns each callback, how much CPU time it uses, and how often it throws.
 *
 * - Speed panel: every watcher, Flux handler, patch and timer a plugin sets up while starting is timed (a couple of
 *   performance.now() calls, nothing more), so Settings can show each plugin's cost.
 * - Crash shield: a plugin that keeps throwing (8 errors within a minute) is switched off and you're told which one,
 *   instead of it quietly breaking things.
 */
import { logger } from "./logger";

export interface PluginStats {
    /** CPU time (ms) and calls in the current minute, and in the last full minute */
    ms: number; calls: number; lastMs: number; lastCalls: number;
    errors: number; recent: number[]; lastError: string | null;
    /** how long start() took */
    startMs: number;
    since: number;
}

const stats = new Map<string, PluginStats>();
const TRIP_ERRORS = 8, TRIP_WINDOW = 60_000;
let tripHandler: ((name: string, error: string) => void) | null = null;

/** The plugin whose start() is running right now: anything it sets up is attributed to it */
let current: string | null = null;

function entry(name: string): PluginStats {
    let s = stats.get(name);
    if (!s) stats.set(name, s = { ms: 0, calls: 0, lastMs: 0, lastCalls: 0, errors: 0, recent: [], lastError: null, startMs: 0, since: performance.now() });
    const now = performance.now();
    if (now - s.since >= 60_000) { // roll the minute over
        const full = now - s.since < 120_000;
        s.lastMs = full ? s.ms : 0; s.lastCalls = full ? s.calls : 0;
        s.ms = 0; s.calls = 0; s.since = now;
    }
    return s;
}

export const health = {
    get current() { return current; },
    /** Runs a plugin's start() with ownership set for its synchronous part */
    attribute<T>(name: string, fn: () => T): T {
        const prev = current;
        current = name;
        try { return fn(); } finally { current = prev; }
    },
    /** Times a plugin's callback and reports what it throws (then rethrows, so the caller's own handling still runs) */
    track<T>(owner: string | null, fn: () => T): T {
        if (!owner) return fn();
        const t = performance.now();
        try { return fn(); }
        catch (e) { health.report(owner, e); throw e; }
        finally { const s = entry(owner); s.ms += performance.now() - t; s.calls++; }
    },
    report(owner: string | null, e: unknown) {
        if (!owner) return;
        const s = entry(owner);
        const now = performance.now();
        s.errors++;
        s.lastError = String((e as Error)?.message ?? e).slice(0, 300);
        s.recent = s.recent.filter(t => now - t < TRIP_WINDOW);
        s.recent.push(now);
        if (s.recent.length >= TRIP_ERRORS && tripHandler) {
            s.recent = [];
            logger.warn(`Crash shield: turning off ${owner} after ${TRIP_ERRORS} errors in a minute`, e);
            tripHandler(owner, s.lastError);
        }
    },
    startTime(name: string, ms: number) { entry(name).startMs = ms; },
    onTrip(fn: (name: string, error: string) => void) { tripHandler = fn; },
    stats(name: string): PluginStats | undefined { return stats.has(name) ? entry(name) : undefined; },
    all() { return [...stats.keys()].map(n => [n, entry(n)] as const); },
    reset(name: string) { stats.delete(name); },
};
