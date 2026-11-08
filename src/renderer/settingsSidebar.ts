/*
 * Adds an "Obsid Settings" section to Discord's User Settings sidebar.
 *
 * Discord's class names are hashed and change between builds, so nothing here hardcodes them:
 * the section and items are cloned from Discord's own sidebar at runtime, then relabelled.
 * Pages render into a host placed next to Discord's content body, which is hidden while ours shows.
 */
import { logger } from "./core/logger";
import { onDomReady, sleep } from "./core/utils";
import { ui, pages, mountPage } from "./ui/components";

const SECTION_ATTR = "data-obsid-section";
const pageStates: Record<string, Record<string, any>> = {};

interface Current {
    nav: HTMLElement;
    body: HTMLElement;
    crumbs: HTMLElement | null;
    crumbClone: HTMLElement | null;
    host: HTMLElement;
    scroller: HTMLElement;
    mount: HTMLElement;
    deactivated: { link: Element; cls: string[]; aria: string | null }[];
    onNavClick: (e: Event) => void;
    controller: ReturnType<typeof mountPage> | null;
}
let current: Current | null = null;

const q = <T extends Element = HTMLElement>(root: ParentNode | null | undefined, sel: string) => (root?.querySelector(sel) as T | null) ?? null;
const hasClassPrefix = (el: Element | null, prefix: string) => [...(el?.classList || [])].some(c => c.startsWith(prefix + "_"));
const activeClassFor = (el: Element) => {
    const itemCls = [...el.classList].find(c => /^item_/.test(c));
    return itemCls ? "active_" + itemCls.split("_").slice(1).join("_") : null;
};

/** Deepest element that holds visible text. */
function textLeaf(el: Element): Element {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent!.trim() ? 1 : 3 });
    return walker.nextNode()?.parentElement || el;
}

function findNav(): HTMLElement | null {
    return document.querySelector("[data-settings-sidebar-item]:not([data-obsid-page])")?.closest("nav") ?? null;
}

/* ------------------------------------------------------------- injection */
function inject(nav: HTMLElement) {
    if (q(nav, `[${SECTION_ATTR}]`)) return;
    const sections = [...nav.querySelectorAll<HTMLElement>('li[class*="section_"]')].filter(li => !li.hasAttribute(SECTION_ATTR));
    const first = sections[0];
    const labelled = sections.find(li => q(li, '[class*="sectionLabel_"]'));
    const template = [...nav.querySelectorAll<HTMLElement>("li[data-settings-sidebar-item]")]
        .find(li => !li.dataset.obsidPage && !q(li, '[class*="subnav"]') && q(li, "svg"));
    const listTemplate = q(first, 'ul[class*="sectionList_"]');
    if (!first || !template || !listTemplate) return;

    const section = first.cloneNode(false) as HTMLElement;
    section.setAttribute(SECTION_ATTR, "");
    if (labelled) {
        const label = q(labelled, '[class*="sectionLabel_"]')!.cloneNode(true) as HTMLElement;
        textLeaf(label).textContent = "Obsid Settings";
        section.append(label);
    }
    const list = listTemplate.cloneNode(false) as HTMLElement;
    for (const page of pages) list.append(makeItem(template, page));
    section.append(list);
    first.after(section);
    hookSearch(nav);
    logger.log("Added Obsid section to settings sidebar");
}

function makeItem(template: HTMLElement, page: (typeof pages)[number]) {
    const li = template.cloneNode(true) as HTMLElement;
    li.setAttribute("data-settings-sidebar-item", "obsid_" + page.id);
    li.dataset.obsidPage = page.id;
    const link = (q(li, '[role="link"]') || li.firstElementChild) as HTMLElement;
    for (const c of [...link.classList]) if (/^active_/.test(c)) link.classList.remove(c);
    link.removeAttribute("aria-current");
    link.removeAttribute("data-list-item-id");
    link.tabIndex = 0;
    const svg = q(link, "svg");
    if (svg) {
        const ic = ui.icon(page.icon, Number(svg.getAttribute("width")) || 20);
        ic.setAttribute("class", svg.getAttribute("class") || "");
        svg.replaceWith(ic);
    }
    textLeaf(link).textContent = page.label;
    const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); open(page.id); };
    link.addEventListener("click", go);
    link.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") go(e); });
    return li;
}

/** Hide our items that don't match Discord's sidebar search. */
function hookSearch(nav: HTMLElement) {
    const input = q<HTMLInputElement>(nav.closest("aside"), 'input[type="text"], input:not([type])');
    if (!input || input.dataset.obsidHooked) return;
    input.dataset.obsidHooked = "1";
    input.addEventListener("input", () => {
        const section = q(nav, `[${SECTION_ATTR}]`);
        if (!section) return;
        const term = input.value.trim().toLowerCase();
        let shown = 0;
        for (const li of section.querySelectorAll<HTMLElement>("[data-obsid-page]")) {
            const page = pages.find(p => p.id === li.dataset.obsidPage)!;
            const match = !term || [page.label, "obsid", ...(page.keywords || [])].join(" ").toLowerCase().includes(term);
            li.style.display = match ? "" : "none";
            if (match) shown++;
        }
        section.style.display = shown ? "" : "none";
    });
}

/* ------------------------------------------------------------ open/close */
export function open(pageId: string, state?: Record<string, any>): boolean {
    const nav = findNav();
    if (!nav) return false;
    const aside = nav.closest("aside");
    const content = aside?.parentElement && [...aside.parentElement.children].find(c => hasClassPrefix(c, "content")) as HTMLElement | undefined;
    const body = content && [...content.children].find(c => hasClassPrefix(c, "contentBody")) as HTMLElement | undefined;
    if (!content || !body) { logger.warn("Settings content area not found"); return false; }
    if (state) Object.assign(pageStates[pageId] ??= {}, state);

    if (!current) {
        const header = [...content.children].find(c => hasClassPrefix(c, "contentHeader")) ?? null;
        const crumbs = q(header, 'nav[class*="breadcrumbsNav_"]');

        // Deactivate Discord's highlighted item(s); remember them so we can restore.
        const deactivated: Current["deactivated"] = [];
        for (const link of nav.querySelectorAll('[role="link"]')) {
            if (link.closest("[data-obsid-page]")) continue;
            const cls = [...link.classList].filter(c => /^active_/.test(c));
            const aria = link.getAttribute("aria-current");
            if (cls.length || aria) {
                deactivated.push({ link, cls, aria });
                link.classList.remove(...cls);
                link.removeAttribute("aria-current");
            }
        }

        let crumbClone: HTMLElement | null = null;
        if (crumbs) {
            crumbClone = crumbs.cloneNode(true) as HTMLElement;
            crumbClone.dataset.obsidCrumb = "";
            crumbClone.querySelectorAll('li, [role="listitem"]').forEach((li, i) => { if (i > 0) li.remove(); });
            crumbs.style.display = "none";
            crumbs.after(crumbClone);
        }

        const host = document.createElement("div");
        host.className = body.className;
        host.dataset.obsidHost = "";
        const scroller = document.createElement("div");
        if (body.firstElementChild) scroller.className = body.firstElementChild.className;
        scroller.style.overflowY = "auto";
        scroller.style.height = "100%";
        scroller.dataset.obsidScroll = "";
        const mount = document.createElement("div");
        scroller.append(mount);
        host.append(scroller);
        body.style.display = "none";
        body.after(host);

        const onNavClick = (e: Event) => {
            const link = (e.target as Element).closest?.('[role="link"]');
            if (link && !link.closest("[data-obsid-page]")) close();
        };
        nav.addEventListener("click", onNavClick, true);
        current = { nav, body, crumbs, crumbClone, host, scroller, mount, deactivated, onNavClick, controller: null };
    }

    current.controller?.dispose();
    current.controller = mountPage(pageId, current.mount, { state: pageStates[pageId] ??= {}, navigate: (to, s) => open(to, s) });
    current.scroller.scrollTop = 0;
    const page = current.controller.page;
    if (current.crumbClone) textLeaf(current.crumbClone).textContent = page.label;

    for (const li of nav.querySelectorAll<HTMLElement>("[data-obsid-page]")) {
        const link = q(li, '[role="link"]');
        if (!link) continue;
        const cls = activeClassFor(link);
        const on = li.dataset.obsidPage === page.id;
        if (cls) link.classList.toggle(cls, on);
        if (on) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    }
    return true;
}

export function close() {
    if (!current) return;
    const c = current;
    current = null;
    try { c.controller?.dispose(); } catch { }
    c.host.remove();
    c.crumbClone?.remove();
    if (c.crumbs) c.crumbs.style.display = "";
    c.body.style.display = "";
    c.nav.removeEventListener("click", c.onNavClick, true);
    for (const { link, cls, aria } of c.deactivated) {
        if (!link.isConnected) continue;
        link.classList.add(...cls);
        if (aria) link.setAttribute("aria-current", aria);
    }
    for (const link of c.nav.querySelectorAll('[data-obsid-page] [role="link"]')) {
        const cls = activeClassFor(link);
        if (cls) link.classList.remove(cls);
        link.removeAttribute("aria-current");
    }
}

/* --------------------------------------------------------------- watcher */
let queued = false;
function check() {
    queued = false;
    if (current && !current.host.isConnected) { try { current.controller?.dispose(); } catch { } current = null; }
    const nav = findNav();
    if (nav && !q(nav, `[${SECTION_ATTR}]`)) {
        try { inject(nav); } catch (e) { logger.error("Sidebar injection failed", e); }
    }
}
onDomReady(() => {
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(check); } })
        .observe(document.body, { childList: true, subtree: true });
});

/** Opens Discord's User Settings and shows an Obsid page. Returns false if it couldn't. */
export async function openInSettings(pageId = "obsid", state?: Record<string, any>) {
    if (!findNav()) {
        const gear = document.querySelector<HTMLElement>('[aria-label="User Settings"], [aria-label="User settings"]');
        if (!gear) return false;
        gear.click();
        for (let i = 0; i < 40 && !findNav(); i++) await sleep(50);
        check();
    }
    return open(pageId, state);
}

export const settingsSidebar = { open, close, openInSettings, get current() { return current; } };
