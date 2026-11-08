/*
 * Request-level hooks over XHR, fetch and sendBeacon. Plugins add blockers (drop a request and
 * pretend it succeeded) and body transformers (rewrite what's sent, e.g. message JSON).
 */
import { logger } from "./logger";

export interface NetRequest {
    method: string;
    url: string;
    body: any;
}
export type Blocker = (req: NetRequest) => boolean;
export type Transformer = ((req: NetRequest) => any) & { __anyBody?: boolean };

const blockers = new Set<Blocker>();
const transformers = new Set<Transformer>();

function isBlocked(req: NetRequest) {
    for (const b of blockers) { try { if (b(req)) return true; } catch (e) { logger.error(e); } }
    return false;
}

function applyTransforms(req: NetRequest) {
    if (req.body == null) return req.body;
    for (const t of transformers) {
        if (typeof req.body !== "string" && !t.__anyBody) continue;
        try { const r = t(req); if (r !== undefined) req.body = r; } catch (e) { logger.error(e); }
    }
    return req.body;
}

export const net = {
    /** Drop matching requests (they look successful to Discord). Returns a remove function. */
    block(fn: Blocker) { blockers.add(fn); return () => { blockers.delete(fn); }; },
    /**
     * Rewrite request bodies. fn returns the new body, or undefined to leave it.
     * Gets string (JSON) bodies only, unless { anyBody: true } (FormData, Blob…).
     */
    transform(fn: Transformer, { anyBody = false } = {}) {
        fn.__anyBody = anyBody;
        transformers.add(fn);
        return () => { transformers.delete(fn); };
    },
    isBlocked,
    applyTransforms,
};

const absUrl = (u: unknown) => { try { return new URL(String(u), location.href).href; } catch { return String(u); } };

/* ------------------------------------------------------------- install hooks */
type TaggedXHR = XMLHttpRequest & { __obsid?: NetRequest };
const XHR = XMLHttpRequest.prototype as TaggedXHR;
const origOpen = XHR.open, origSend = XHR.send;

XHR.open = function (this: TaggedXHR, method: string, url: string | URL, ...rest: any[]) {
    this.__obsid = { method: String(method).toUpperCase(), url: absUrl(url), body: undefined };
    return (origOpen as any).call(this, method, url, ...rest);
};
XHR.send = function (this: TaggedXHR, body?: any) {
    const req = this.__obsid;
    if (req) {
        req.body = body;
        if (isBlocked(req)) return fakeXhrSuccess(this);
        body = applyTransforms(req);
    }
    return origSend.call(this, body);
};

function fakeXhrSuccess(xhr: TaggedXHR) {
    const def = (k: string, v: unknown) => Object.defineProperty(xhr, k, { configurable: true, get: () => v });
    def("readyState", 4); def("status", 204); def("statusText", "No Content");
    def("responseText", ""); def("response", ""); def("responseURL", xhr.__obsid!.url);
    setTimeout(() => { for (const t of ["readystatechange", "load", "loadend"]) xhr.dispatchEvent(new Event(t)); });
}

const origFetch = window.fetch;
window.fetch = function (this: unknown, input: RequestInfo | URL, init: RequestInit = {}) {
    const isReq = input instanceof Request;
    const req: NetRequest = {
        method: String(init.method || (isReq ? input.method : "GET")).toUpperCase(),
        url: absUrl(isReq ? input.url : input),
        body: init.body,
    };
    if (isBlocked(req)) return Promise.resolve(new Response(null, { status: 204 }));
    if (init.body != null) {
        const body = applyTransforms(req);
        if (body !== init.body) init = { ...init, body };
    }
    return origFetch.call(this, input, init);
} as typeof fetch;

if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) =>
        isBlocked({ method: "POST", url: absUrl(url), body: data }) ? true : origBeacon(url, data);
}
