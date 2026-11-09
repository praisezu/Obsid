/*
 * Method patching that stacks: several plugins can patch the same function, and each
 * unpatch() removes only its own patch. The original is restored when none are left.
 */
import { logger } from "./logger";
import { health } from "./health";

const PATCH = Symbol("vanta.patch");
const owners = new WeakMap<object, string | null>();

type BeforeFn = (this: any, args: any[]) => any[] | void;
type InsteadFn = (this: any, args: any[], original: (...a: any[]) => any) => any;
type AfterFn = (this: any, args: any[], result: any) => any;

interface PatchInfo {
    original: (...a: any[]) => any;
    before: Set<BeforeFn>;
    instead: Set<InsteadFn>;
    after: Set<AfterFn>;
    wrapper: ((...a: any[]) => any) & { [PATCH]?: PatchInfo };
}

function setProp(obj: any, key: PropertyKey, value: unknown) {
    try { obj[key] = value; } catch { }
    if (obj[key] !== value)
        Object.defineProperty(obj, key, { value, configurable: true, writable: true, enumerable: true });
}

function getPatchInfo(obj: any, method: string): PatchInfo {
    const current = obj[method];
    if (current?.[PATCH]) return current[PATCH];
    if (typeof current !== "function") throw new TypeError(`${method} is not a function`);

    const info = { original: current, before: new Set(), instead: new Set(), after: new Set() } as PatchInfo;
    const wrapper = function (this: any, ...args: any[]) {
        const self = this;
        for (const b of info.before) {
            try { const r = health.track(owners.get(b) ?? null, () => b.call(self, args)); if (Array.isArray(r)) args = r; }
            catch (e) { logger.error(`before-patch on ${method} threw`, e); }
        }
        let call = (...a: any[]) => info.original.apply(self, a);
        for (const fn of info.instead) {
            const next = call;
            call = (...a: any[]) => {
                try { return health.track(owners.get(fn) ?? null, () => fn.call(self, a, next)); }
                catch (e) { logger.error(`instead-patch on ${method} threw`, e); return next(...a); }
            };
        }
        let result = call(...args);
        for (const a of info.after) {
            try { const r = health.track(owners.get(a) ?? null, () => a.call(self, args, result)); if (r !== undefined) result = r; }
            catch (e) { logger.error(`after-patch on ${method} threw`, e); }
        }
        return result;
    } as PatchInfo["wrapper"];
    wrapper[PATCH] = info;
    wrapper.toString = () => info.original.toString();
    Object.setPrototypeOf(wrapper, Object.getPrototypeOf(current));
    info.wrapper = wrapper;
    setProp(obj, method, wrapper);
    return info;
}

function addPatch<K extends "before" | "instead" | "after">(type: K, obj: any, method: string, fn: any) {
    const info = getPatchInfo(obj, method);
    (info[type] as Set<any>).add(fn);
    owners.set(fn, health.current);
    return () => {
        (info[type] as Set<any>).delete(fn);
        if (!info.before.size && !info.instead.size && !info.after.size && obj[method] === info.wrapper)
            setProp(obj, method, info.original);
    };
}

export const patcher = {
    /** fn(args) runs first; it may change args or return a new args array. Returns unpatch(). */
    before: (obj: any, method: string, fn: BeforeFn) => addPatch("before", obj, method, fn),
    /** fn(args, original) replaces the call; its return value is the result. Returns unpatch(). */
    instead: (obj: any, method: string, fn: InsteadFn) => addPatch("instead", obj, method, fn),
    /** fn(args, result) runs last; return something other than undefined to replace the result. */
    after: (obj: any, method: string, fn: AfterFn) => addPatch("after", obj, method, fn),
};
