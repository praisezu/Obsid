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

function badge() {
    const el = h("div", {
        class: "vanta-profile-badge", role: "img", "aria-label": "Uses Vanta", title: "Uses Vanta",
        style: { width: "22px", height: "22px", display: "inline-grid", placeItems: "center", cursor: "default" },
    }, ui.logo(20));
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
