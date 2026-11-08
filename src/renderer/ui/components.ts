/*
 * UI toolkit shared by the settings pages, the Discord sidebar section and the quick panel.
 * Plain DOM only (no innerHTML, so it works under Trusted Types).
 */
import { settings, saveSettings } from "../core/settings";
import { logger } from "../core/logger";
import { onDomReady } from "../core/utils";
import { CSS } from "./styles";
import { ICONS } from "./icons";

const SVG_NS = "http://www.w3.org/2000/svg";

export type Child = Node | string | null | undefined | false | Child[];
type Props = Record<string, any> | null;

/** Tiny element builder: h("div", { class: "x", onclick }, "text", child) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null || v === false) continue;
        if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "value" || k === "checked" || k === "disabled") (el as any)[k] = v;
        else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of (children as any[]).flat(Infinity)) if (c != null && c !== false) el.append(c);
    return el;
}

export function ensureStyle() {
    if (document.getElementById("obsid-ui-style")) return;
    document.head.append(h("style", { id: "obsid-ui-style" }, CSS));
}

/* ----------------------------------------------------------------- icons */
export function icon(name: string, size = 20): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "currentColor");
    const def = ICONS[name] || ICONS.info;
    for (const [d, opacity] of typeof def === "string" ? [[def, 1] as [string, number]] : def) {
        const p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("fill-rule", "evenodd");
        if (opacity !== 1) p.setAttribute("opacity", String(opacity));
        svg.append(p);
    }
    return svg;
}

/** Full-colour Obsid gem. */
export function logo(size = 48): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    const facets: [string, string][] = [
        ["16,2 28,11 23,30 9,30 4,11", "#2a1f3d"], ["16,2 28,11 16,15", "#a78bfa"], ["16,2 16,15 4,11", "#7c3aed"],
        ["4,11 16,15 9,30", "#4c1d95"], ["28,11 23,30 16,15", "#5b21b6"], ["16,15 23,30 9,30", "#3b1a6e"],
    ];
    for (const [points, fill] of facets) {
        const p = document.createElementNS(SVG_NS, "polygon");
        p.setAttribute("points", points);
        p.setAttribute("fill", fill);
        svg.append(p);
    }
    return svg;
}

/* ------------------------------------------------------------ components */
export function switchEl({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
    const el = h("button", {
        class: "obsid-switch", role: "switch", type: "button",
        "aria-checked": String(!!checked), "aria-label": label, disabled,
    });
    el.addEventListener("click", e => {
        e.stopPropagation();
        const next = el.getAttribute("aria-checked") !== "true";
        el.setAttribute("aria-checked", String(next));
        onChange?.(next);
    });
    return el;
}

export interface ButtonOptions {
    variant?: string;
    icon?: string;
    onClick?: (e: MouseEvent) => unknown;
    small?: boolean;
    title?: string;
    disabled?: boolean;
}

export function button(text: string, { variant = "", icon: ic, onClick, small, title, disabled }: ButtonOptions = {}) {
    const cls = ["obsid-btn", variant, small && "small", !text && "icon-only"].filter(Boolean).join(" ");
    const el = h("button", { class: cls, type: "button", title, "aria-label": !text ? title : null, disabled },
        ic ? icon(ic, small || !text ? 16 : 18) : null, text || null);
    if (onClick) el.addEventListener("click", async e => {
        if (el.disabled) return;
        el.disabled = true;
        try { await onClick(e); } finally { if (el.isConnected) el.disabled = !!disabled; }
    });
    return el;
}

export const pageHead = (title: string, subtitle?: string) =>
    h("div", { class: "obsid-page-head" }, h("h1", {}, title), subtitle ? h("p", {}, subtitle) : null);

export const section = (title: string | null, ...children: Child[]) =>
    h("section", { class: "obsid-section" }, title ? h("h2", { class: "obsid-section-title" }, title) : null, children);

export const card = (props: Props, ...children: Child[]) =>
    h("div", { ...props, class: "obsid-card " + (props?.class || "") }, children);

export function row({ title, description, control }: { title: Child; description?: Child; control?: Child }) {
    return h("div", { class: "obsid-row" },
        h("div", { class: "obsid-row-text" },
            h("div", { class: "obsid-row-title" }, title),
            description ? h("div", { class: "obsid-row-desc" }, description) : null),
        control);
}

/** A settings row bound to a boolean in settings.obsid */
export function settingRow(key: keyof typeof settings.obsid, title: string, description: string, onChange?: (v: boolean) => void) {
    return row({
        title, description,
        control: switchEl({
            checked: settings.obsid[key], label: title,
            onChange: v => { settings.obsid[key] = v; saveSettings(); onChange?.(v); },
        }),
    });
}

export function searchInput(placeholder: string, onInput: (v: string) => void) {
    const input = h("input", { class: "obsid-input", type: "search", placeholder, "aria-label": placeholder });
    input.addEventListener("input", () => onInput(input.value));
    return h("div", { class: "obsid-input-wrap" }, icon("search", 18), input);
}

export function segment(options: [string, string][], value: string, onChange: (id: string) => void) {
    const wrap = h("div", { class: "obsid-segment", role: "group" });
    const render = () => {
        wrap.replaceChildren(...options.map(([id, label]) => h("button", {
            class: "obsid-chip", type: "button", "aria-pressed": String(id === value),
            onclick: () => { value = id; render(); onChange(id); },
        }, label)));
    };
    render();
    return wrap;
}

export function tabs(list: [string, string][], active: string, onSelect: (id: string) => void) {
    return h("div", { class: "obsid-tabs", role: "tablist" }, list.map(([id, label]) =>
        h("button", { class: "obsid-tab", role: "tab", type: "button", "aria-selected": String(id === active), onclick: () => onSelect(id) }, label)));
}

export const empty = (text: string, iconName = "info", ...extra: Child[]) =>
    h("div", { class: "obsid-empty" }, icon(iconName, 32), h("div", {}, text), extra);

export const note = (kind: "" | "warn" | "danger", ...children: Child[]) =>
    h("div", { class: "obsid-note " + kind }, icon(kind === "warn" || kind === "danger" ? "warn" : "info", 18), h("div", {}, children));

export const tag = (text: string, kind = "", title?: string) => h("span", { class: "obsid-tag " + kind, title }, text);

/* ---------------------------------------------------------- modal, toast */
export interface ModalButton {
    text: string;
    variant?: string;
    value?: unknown;
    /** return false to keep the modal open */
    onClick?: () => unknown;
}

export function modal({ title, body, buttons = [], onClose }: { title: string; body: Child; buttons?: ModalButton[]; onClose?: (result: unknown) => void }) {
    ensureStyle();
    const prevFocus = document.activeElement as HTMLElement | null;
    let closed = false;
    const close = (result?: unknown) => {
        if (closed) return;
        closed = true;
        back.remove();
        document.removeEventListener("keydown", onKey, true);
        prevFocus?.focus?.();
        onClose?.(result);
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(null); }
    };
    const foot = h("div", { class: "obsid-modal-foot" }, buttons.map(b =>
        button(b.text, { variant: b.variant, onClick: async () => { const r = await b.onClick?.(); if (r !== false) close(b.value); } })));
    const back: HTMLDivElement = h("div", { class: "obsid-modal-back obsid-scope", onmousedown: (e: MouseEvent) => { if (e.target === back) close(null); } },
        h("div", { class: "obsid-modal", role: "dialog", "aria-modal": "true", "aria-label": title },
            h("div", { class: "obsid-modal-head" }, title),
            h("div", { class: "obsid-modal-body" }, body),
            buttons.length ? foot : null));
    for (const t of ["keydown", "keypress", "keyup"])
        back.addEventListener(t, e => { if ((e as KeyboardEvent).key !== "Escape") e.stopPropagation(); });
    document.addEventListener("keydown", onKey, true);
    document.body.append(back);
    ((back.querySelector("input,textarea") || foot.lastElementChild) as HTMLElement | null)?.focus();
    return { close, el: back };
}

export function confirm({ title, body, confirmText = "Confirm", danger }: { title: string; body: Child; confirmText?: string; danger?: boolean }) {
    return new Promise<boolean>(resolve => {
        modal({
            title, body,
            buttons: [
                { text: "Cancel", variant: "ghost", value: false },
                { text: confirmText, variant: danger ? "danger solid" : "primary", value: true },
            ],
            onClose: r => resolve(r === true),
        });
    });
}

export function toast(text: string, { type = "", ms = 4000 }: { type?: "" | "ok" | "danger"; ms?: number } = {}) {
    onDomReady(() => {
        ensureStyle();
        let host = document.getElementById("obsid-toasts");
        if (!host) document.body.append(host = h("div", { id: "obsid-toasts", class: "obsid-scope", role: "status", "aria-live": "polite" }));
        const el = h("div", { class: "obsid-toast " + type },
            type === "danger" ? icon("warn", 18) : type === "ok" ? icon("check", 18) : icon("gem", 18), text);
        host.append(el);
        setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 260); }, ms);
    });
}

/* ----------------------------------------------------------------- pages */
export interface PageContext {
    state: Record<string, any>;
    onDispose(fn: () => void): void;
    navigate(to: string, state?: Record<string, any>): void;
    rerender(): void;
}

export interface Page {
    id: string;
    label: string;
    icon: string;
    order?: number;
    keywords?: string[];
    render(ctx: PageContext): Node;
}

export const pages: Page[] = [];

export function registerPage(page: Page) {
    pages.push(page);
    pages.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/** Mounts a page into `container`. Returns a controller with dispose(). */
export function mountPage(id: string, container: HTMLElement, { navigate, state = {} }: { navigate?: (to: string, s?: Record<string, any>) => void; state?: Record<string, any> } = {}) {
    ensureStyle();
    const page = pages.find(p => p.id === id) || pages[0];
    const disposers: (() => void)[] = [];
    const dispose = () => { for (const d of disposers.splice(0)) { try { d(); } catch { } } };
    const render = () => {
        let content: Node;
        try { content = page.render(ctx); }
        catch (e: any) {
            logger.error(`Page ${page.id} failed to render`, e);
            content = h("div", { class: "obsid-page" }, note("danger", `This page crashed: ${e.message}`));
        }
        container.replaceChildren(content);
    };
    const ctx: PageContext = {
        state,
        onDispose: fn => { disposers.push(fn); },
        navigate: (to, s) => navigate?.(to, s),
        rerender() {
            const scroll = (container.closest("[data-obsid-scroll]") || container) as HTMLElement;
            const top = scroll.scrollTop;
            dispose();
            render();
            scroll.scrollTop = top;
        },
    };
    container.classList.add("obsid-scope");
    render();
    return { page, dispose, ctx };
}

export const ui = {
    h, icon, logo, ensureStyle,
    switch: switchEl, button, pageHead, section, card, row, settingRow, searchInput, segment, tabs, empty, note, tag,
    modal, confirm, toast,
    pages, registerPage, mountPage,
};
