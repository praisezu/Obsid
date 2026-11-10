/*
 * Vanta badge: shows a small Vanta badge on the profiles of people who use Vanta too.
 *
 * There's no Vanta server keeping a list, so people who opt in carry an invisible marker (a few zero-width characters)
 * at the end of their About Me. Nobody sees it in Discord; other Vanta users' clients spot it and show the badge.
 * It's opt-in: everyone is asked once, it can be turned off any time (Settings → Vanta), and turning it off removes it.
 */
import { settings, saveSettings } from "./core/settings";
import { common } from "./core/common";
import { discord } from "./core/discord";
import { findStore, ready as webpackReady } from "./core/webpack";
import { watchElements } from "./core/dom";
import { logger } from "./core/logger";
import { ui, h } from "./ui/components";

/** Zero-width joiner, word joiner, zero-width non-joiner, word joiner: invisible, and very unlikely by accident */
export const MARKER = "‍⁠‌⁠";
const BIO_MAX = 190;

let Profiles: any = null;
const profileStore = () => (Profiles ??= findStore("UserProfileStore"));
const bioOf = (id: string): string | null => profileStore()?.getUserProfile?.(id)?.bio ?? null;
export const usesVanta = (id: string) => !!bioOf(id)?.includes(MARKER);

async function myBio(): Promise<string> {
    const me = common.UserStore?.getCurrentUser?.()?.id;
    const cached = me ? bioOf(me) : null;
    if (cached != null) return cached;
    const res = await discord.api().get({ url: `/users/${me}/profile` });
    return res?.body?.user_profile?.bio ?? res?.body?.user?.bio ?? "";
}

/** Adds or removes the marker on your own About Me */
export async function setMyBadge(on: boolean) {
    const bio = await myBio();
    const has = bio.includes(MARKER);
    if (on === has) return true;
    const next = on ? bio + MARKER : bio.split(MARKER).join("");
    if (on && next.length > BIO_MAX) { ui.toast("Your About Me is too long to fit the invisible Vanta marker (it needs 4 characters).", { type: "danger", ms: 7000 }); return false; }
    await discord.api().patch({ url: "/users/@me/profile", body: { bio: next } });
    return true;
}

const BADGE_CSS = `.vanta-profile-badge { width: 22px; height: 22px; display: inline-grid; place-items: center; cursor: pointer; position: relative; border-radius: 4px; }
.vanta-profile-badge:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.vanta-badge-tip { position: fixed; z-index: 100010; padding: 6px 10px; border-radius: 6px; background: var(--background-floating, #111214); color: var(--text-normal, #dbdee1);
  font: 600 13px/1.3 var(--font-primary, "gg sans", sans-serif); box-shadow: 0 8px 16px rgba(0,0,0,.24); pointer-events: none; white-space: nowrap; transform: translate(-50%, -100%); }
.vanta-badge-tip::after { content: ""; position: absolute; left: 50%; bottom: -5px; transform: translateX(-50%); border: 5px solid transparent; border-bottom: 0; border-top-color: var(--background-floating, #111214); }
.vanta-badge-card { position: fixed; z-index: 100011; width: 260px; padding: 14px; border-radius: 10px; background: var(--background-floating, #111214); color: var(--text-normal, #dbdee1);
  box-shadow: 0 12px 32px rgba(0,0,0,.4); border: 1px solid rgba(169,139,255,.35); font: 14px/1.45 var(--font-primary, "gg sans", sans-serif); animation: vanta-badge-in .14s ease-out; }
.vanta-badge-card .vbc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.vanta-badge-card .vbc-head b { display: block; font-size: 15px; color: var(--header-primary, #fff); }
.vanta-badge-card .vbc-head small { color: #b9a4ff; font-weight: 600; font-size: 12px; }
.vanta-badge-card p { margin: 0 0 12px; color: var(--text-muted, #b5bac1); font-size: 13px; }
.vanta-badge-card button { all: unset; box-sizing: border-box; width: 100%; text-align: center; cursor: pointer; padding: 8px; border-radius: 6px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #7c4dff, #a98bff); }
.vanta-badge-card button:hover { filter: brightness(1.1); }
@keyframes vanta-badge-in { from { opacity: 0; transform: translateY(4px) scale(.98); } }`;

let tip: HTMLElement | null = null, card: HTMLElement | null = null;
function hideTip() { tip?.remove(); tip = null; }
function closeCard() { card?.remove(); card = null; document.removeEventListener("mousedown", outside, true); }
function outside(e: MouseEvent) { if (card && !card.contains(e.target as Node)) closeCard(); }

/** Like Discord's Nitro badge: a tooltip on hover, a little card on click */
function badge() {
    const el = h("div", { class: "vanta-profile-badge", role: "button", tabindex: 0, "aria-label": "Uses Vanta" }, ui.logo(20));
    el.addEventListener("mouseenter", () => {
        hideTip();
        const r = el.getBoundingClientRect();
        tip = h("div", { class: "vanta-badge-tip" }, "Vanta");
        tip.style.left = r.left + r.width / 2 + "px"; tip.style.top = r.top - 8 + "px";
        document.body.append(tip);
    });
    el.addEventListener("mouseleave", hideTip);
    const open = (e: Event) => {
        e.preventDefault(); e.stopPropagation(); hideTip();
        if (card) return closeCard();
        const r = el.getBoundingClientRect();
        card = h("div", { class: "vanta-badge-card", role: "dialog", "aria-label": "Vanta" },
            h("div", { class: "vbc-head" }, ui.logo(36), h("div", {}, h("b", {}, "Vanta"), h("small", {}, "Uses Vanta"))),
            h("p", {}, "This person uses Vanta, a Discord client mod with themes, 100+ plugins and Capri, a desktop mate who lives in Discord."),
            h("button", { type: "button", onclick: () => { closeCard(); (window as any).VantaNative?.openUrl?.("https://tryvanta.dev"); } }, "Get Vanta"));
        document.body.append(card);
        const w = 260, hgt = card.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        const top = r.bottom + 8 + hgt > window.innerHeight ? r.top - hgt - 8 : r.bottom + 8;
        card.style.left = left + "px"; card.style.top = top + "px";
        setTimeout(() => document.addEventListener("mousedown", outside, true), 0);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") open(e); });
    return el;
}

/** The user a profile belongs to, from the avatar in it (cdn.discordapp.com/avatars/<id>/…) or a data attribute */
function userIdIn(root: Element): string | null {
    const withId = root.closest("[data-user-id]") ?? root.querySelector("[data-user-id]");
    if (withId) return withId.getAttribute("data-user-id");
    for (const img of root.querySelectorAll<HTMLImageElement>("img[src*='/avatars/'], img[src*='/guilds/']")) {
        const m = /\/(?:avatars|users)\/(\d{15,22})\//.exec(img.src);
        if (m) return m[1];
    }
    return null;
}

/** A profile's name row: the badge goes into its "User Badges" group (or a group of its own if they have no badges) */
function decorate(row: HTMLElement) {
    const profile = row.closest('[class*="popoutContainer_"], [class*="userPopout"], [class*="userProfile"], [role="dialog"], aside, [class*="profilePanel_"]') ?? row.parentElement!;
    const id = userIdIn(profile);
    if (!id) return;
    const tryAdd = () => {
        if (row.querySelector(".vanta-profile-badge") || !usesVanta(id)) return;
        let group = row.querySelector<HTMLElement>('[role="group"]');
        if (!group) group = row.appendChild(h("div", { role: "group", "aria-label": "Vanta", style: { display: "inline-flex", alignItems: "center", marginLeft: "4px" } }));
        group.prepend(badge());
    };
    // The profile (and its About Me) often arrives a moment after the popout opens
    tryAdd(); setTimeout(tryAdd, 500); setTimeout(tryAdd, 1800); setTimeout(tryAdd, 4000);
}

export function startVantaBadge() {
    webpackReady.then(() => {
        try {
            document.head.append(Object.assign(document.createElement("style"), { id: "vanta-badge-css", textContent: BADGE_CSS }));
            watchElements('[class*="usernameAndPronounsRow_"]', decorate);
        } catch (e) { logger.warn("Vanta badges couldn't start:", e); }
        // Ask once whether to show your own badge
        setTimeout(() => {
            if (settings.vanta.showBadge !== undefined) return;
            ui.modal({
                title: "Show others you use Vanta?",
                body: h("div", { style: { display: "grid", gap: "10px", lineHeight: "1.5" } },
                    h("div", {}, "Other Vanta users will see a small Vanta badge on your profile."),
                    h("div", { class: "vanta-item-desc" }, "Vanta adds 4 invisible characters to the end of your About Me. Nobody sees them in Discord; only Vanta notices them. You can turn this off any time in Settings → Vanta, which removes them.")),
                buttons: [
                    { text: "No thanks", variant: "ghost", onClick: () => { settings.vanta.showBadge = false; saveSettings(); } },
                    {
                        text: "Show my badge", variant: "primary", onClick: async () => {
                            try { if (await setMyBadge(true)) { settings.vanta.showBadge = true; saveSettings(); ui.toast("Your Vanta badge is on.", { type: "ok" }); } }
                            catch (e: any) { ui.toast("Couldn't update your profile: " + (e?.body?.message ?? e?.message ?? e), { type: "danger" }); }
                        },
                    },
                ],
            });
        }, 20_000);
    });
}
