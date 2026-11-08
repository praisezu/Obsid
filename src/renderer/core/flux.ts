/*
 * Shared subscriptions to Discord's Flux dispatcher. Each event type is subscribed once, however
 * many plugins listen, and unsubscribed when the last listener goes away.
 */
import { common } from "./common";
import { logger } from "./logger";

type Handler = (action: any) => void;
const handlers = new Map<string, Set<Handler>>();
const relays = new Map<string, Handler>();

/** Listen to a Flux action type (e.g. "MESSAGE_CREATE"). Returns a function that stops listening. */
export function onFlux(type: string, fn: Handler) {
    const D = common.FluxDispatcher;
    if (!D) throw new Error("Discord's dispatcher isn't available yet (use needsWebpack: true)");
    let set = handlers.get(type);
    if (!set) {
        set = new Set();
        handlers.set(type, set);
        const relay: Handler = action => {
            for (const h of [...set!]) { try { h(action); } catch (e) { logger.error(`Flux handler for ${type} failed`, e); } }
        };
        relays.set(type, relay);
        D.subscribe(type, relay);
    }
    set.add(fn);
    return () => {
        set!.delete(fn);
        if (!set!.size) {
            D.unsubscribe(type, relays.get(type));
            handlers.delete(type);
            relays.delete(type);
        }
    };
}
