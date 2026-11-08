/*
 * Capri: a desktop mate that lives inside Discord's window (and only there).
 * Her art and animations come from the Capri Desktop project by lachydotmcg
 * (https://github.com/lachydotmcg/capri-desktop), used under PolyForm Noncommercial 1.0.0 with credit.
 * They're loaded from that repo at runtime, not bundled with Vanta.
 */
import { definePlugin, common, onFlux, every, storage, native, h } from "@api";

const REPO = "https://github.com/lachydotmcg/capri-desktop";
const BASE = "https://raw.githubusercontent.com/lachydotmcg/capri-desktop/main/assets/readme/";

type Anim = "idle" | "talk" | "tossed" | "glitch" | "sleep" | "perch" | "perch-music";
/** Frame size, and where she touches the surface (fraction of the frame height): feet, or seat when perched */
const ANIMS: Record<Anim, { w: number; h: number; anchor: number }> = {
    idle: { w: 240, h: 384, anchor: 0.96 },
    talk: { w: 240, h: 384, anchor: 0.96 },
    tossed: { w: 240, h: 384, anchor: 0.3 }, // held by the shoulders while dragged
    glitch: { w: 240, h: 384, anchor: 0.96 },
    sleep: { w: 240, h: 384, anchor: 0.96 },
    perch: { w: 150, h: 294, anchor: 0.52 },
    "perch-music": { w: 150, h: 294, anchor: 0.52 },
};
type Mode = "floor" | "perch" | "air" | "drag";

const GRAVITY = 2600; // px/s²

export default definePlugin({
    name: "Capri",
    description: "Capri, the desktop mate, lives in your Discord window. Drag and throw her, drop her on the message box to sit, and she talks, naps and vibes to your music. Art from the Capri Desktop project.",
    authors: ["Vanta"], category: "Appearance", since: "0.5.3",
    needsWebpack: true,
    options: {
        size: { type: "number", default: 0.5, label: "Size", description: "0.3 to 1" },
        talk: { type: "boolean", default: true, label: "Talk when messages arrive" },
        naps: { type: "boolean", default: true, label: "Nap when you're away" },
        napAfter: { type: "number", default: 3, label: "Nap after (minutes)" },
    },

    scale() { return Math.max(0.3, Math.min(1, Number(this.settings.size) || 0.5)); },
    dims(anim?: Anim) { const a = ANIMS[anim ?? this.anim as Anim], s = this.scale(); return { w: a.w * s, h: a.h * s, anchor: a.anchor }; },
    floorY() { return window.innerHeight - 2; },

    /** The top edge of the message box, if there is one under her */
    ledge(x: number): number | null {
        const box = document.querySelector<HTMLElement>('form [class*="channelTextArea_"]');
        if (!box) return null;
        const r = box.getBoundingClientRect();
        if (!r.width || x < r.left + 12 || x > r.right - 12) return null;
        return r.top;
    },

    setAnim(anim: Anim) {
        if (this.anim === anim) return;
        this.anim = anim;
        this.img.src = BASE + anim + ".webp";
        this.layout();
    },

    layout() {
        const { w, h, anchor } = this.dims();
        this.x = Math.max(w / 2, Math.min(window.innerWidth - w / 2, this.x));
        this.img.style.width = w + "px";
        this.img.style.height = h + "px";
        this.el.style.transform = `translate(${Math.round(this.x - w / 2)}px, ${Math.round(this.y - anchor * h)}px) scaleX(${this.flip ? -1 : 1})`;
    },

    /** What she does when nothing's happening, depending on where she is */
    rest() {
        if (this.timed) return;
        if (this.mode === "perch") this.setAnim(this.music ? "perch-music" : "perch");
        else if (this.mode === "floor") this.setAnim(this.asleep ? "sleep" : "idle");
    },

    /** Plays an animation for a while, then goes back to resting */
    play(anim: Anim, ms: number) {
        clearTimeout(this.timed);
        this.setAnim(anim);
        this.timed = setTimeout(() => { this.timed = 0; this.rest(); }, ms);
    },

    land(mode: "floor" | "perch", y: number) {
        this.mode = mode; this.y = y; this.vx = this.vy = 0;
        cancelAnimationFrame(this.raf); this.raf = 0;
        this.rest();
        this.layout();
        storage.set("Capri", { x: this.x / window.innerWidth, perch: mode === "perch" });
    },

    fall() {
        this.mode = "air";
        clearTimeout(this.timed); this.timed = 0;
        this.setAnim("tossed");
        cancelAnimationFrame(this.raf); // never run two physics loops at once
        let last = performance.now();
        const step = (now: number) => {
            const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
            const prevY = this.y;
            this.vy += GRAVITY * dt;
            this.x += this.vx * dt; this.y += this.vy * dt;
            const { w } = this.dims("idle");
            if (this.x < w / 2 || this.x > window.innerWidth - w / 2) { this.vx *= -0.5; this.x = Math.max(w / 2, Math.min(window.innerWidth - w / 2, this.x)); }
            if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * 0.3; }
            const ledge = this.vy > 0 ? this.ledge(this.x) : null;
            if (ledge !== null && prevY <= ledge && this.y >= ledge) return this.land("perch", ledge);
            if (this.y >= this.floorY()) {
                if (this.vy > 900) { this.y = this.floorY(); this.vy *= -0.32; this.vx *= 0.7; } // one little bounce
                else return this.land("floor", this.floorY());
            }
            this.layout();
            this.raf = requestAnimationFrame(step);
        };
        this.raf = requestAnimationFrame(step);
    },

    wake() {
        this.lastActive = Date.now();
        if (!this.asleep) return;
        this.asleep = false;
        if (this.mode === "floor") this.play("glitch", 1400); // booting back up
    },

    async start() {
        this.mode = "air" as Mode; this.anim = null; this.timed = 0; this.raf = 0;
        this.vx = 0; this.vy = 0; this.flip = false; this.asleep = false; this.music = false;
        this.lastActive = Date.now();

        // Load every animation up front so switching is instant
        this.preload = (Object.keys(ANIMS) as Anim[]).map(a => Object.assign(new Image(), { src: BASE + a + ".webp" }));

        this.el = h("div", { class: "vanta-capri", "aria-hidden": "true" });
        this.img = h("img", { alt: "", draggable: false });
        this.el.append(this.img);
        Object.assign(this.el.style, { position: "fixed", left: "0", top: "0", zIndex: "999", pointerEvents: "none", willChange: "transform", transformOrigin: "50% 50%" });
        Object.assign(this.img.style, { display: "block", pointerEvents: "auto", cursor: "grab", userSelect: "none", imageRendering: "auto", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.35))" });
        document.body.append(this.el);

        // Drag and throw
        this.img.addEventListener("pointerdown", (e: PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            this.img.setPointerCapture(e.pointerId);
            this.wake();
            cancelAnimationFrame(this.raf); this.raf = 0;
            clearTimeout(this.timed); this.timed = 0;
            const start = { x: e.clientX, y: e.clientY, t: performance.now() };
            let moved = false;
            const trail: { x: number; y: number; t: number }[] = [];
            const move = (ev: PointerEvent) => {
                if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
                if (!moved) { moved = true; this.mode = "drag"; this.setAnim("tossed"); this.img.style.cursor = "grabbing"; }
                this.x = ev.clientX; this.y = ev.clientY;
                trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
                if (trail.length > 6) trail.shift();
                this.layout();
            };
            const up = () => {
                this.img.removeEventListener("pointermove", move);
                this.img.removeEventListener("pointerup", up);
                this.img.removeEventListener("pointercancel", up);
                this.img.style.cursor = "grab";
                if (!moved) { // a click: she glitches
                    if (this.mode === "floor") this.play("glitch", 1200);
                    return;
                }
                const a = trail[0], b = trail[trail.length - 1];
                const dt = a && b && b.t > a.t ? (b.t - a.t) / 1000 : 1;
                this.vx = Math.max(-2500, Math.min(2500, a && b ? (b.x - a.x) / dt : 0));
                this.vy = Math.max(-2500, Math.min(2500, a && b ? (b.y - a.y) / dt : 0));
                if (Math.abs(this.vx) > 60) this.flip = this.vx < 0;
                // From the shoulders (where she's held) to her feet
                const d = this.dims("tossed"), f = this.dims("idle");
                this.y += (f.anchor - d.anchor) * f.h;
                this.fall();
            };
            this.img.addEventListener("pointermove", move);
            this.img.addEventListener("pointerup", up);
            this.img.addEventListener("pointercancel", up);
        });

        // Activity keeps her awake
        this.onActive = () => this.wake();
        window.addEventListener("keydown", this.onActive, true);
        window.addEventListener("pointerdown", this.onActive, true);
        let moveT = 0;
        this.onMove = () => { const n = Date.now(); if (n - moveT > 1000) { moveT = n; this.wake(); } };
        window.addEventListener("pointermove", this.onMove, { passive: true });

        this.onResize = () => {
            if (this.mode === "floor") this.y = this.floorY();
            this.layout();
        };
        window.addEventListener("resize", this.onResize);

        // Messages make her talk
        this.off = onFlux("MESSAGE_CREATE", ({ channelId, optimistic }: any) => {
            if (optimistic || !this.settings.talk || this.asleep || this.mode !== "floor" || this.timed) return;
            if (channelId !== common.SelectedChannelStore?.getChannelId?.()) return;
            this.play("talk", 2600);
        });

        // Every half second: follow the message box she sits on, music, naps
        this.tick = every(() => {
            if (this.mode === "perch") {
                const ledge = this.ledge(this.x);
                if (ledge === null) { this.vy = 0; this.fall(); return; } // the box went away (channel change)
                if (Math.abs(ledge - this.y) > 0.5) { this.y = ledge; this.layout(); }
            }
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const music = !!common.PresenceStore?.getActivities?.(me)?.some?.((a: any) => a?.type === 2);
            if (music !== this.music) { this.music = music; this.rest(); }
            const napMs = Math.max(0.5, Number(this.settings.napAfter) || 3) * 60_000;
            if (this.settings.naps && !this.asleep && this.mode === "floor" && Date.now() - this.lastActive > napMs) {
                this.asleep = true; this.rest();
            }
        }, 500);

        // Start where she was last time, dropping in from the top
        const saved = await storage.get<{ x: number; perch: boolean }>("Capri");
        this.x = (saved?.x ?? 0.75) * window.innerWidth;
        this.y = -50;
        this.setAnim("tossed");
        this.fall();
    },

    stop() {
        cancelAnimationFrame(this.raf);
        clearTimeout(this.timed);
        clearInterval(this.tick);
        this.off?.();
        window.removeEventListener("keydown", this.onActive, true);
        window.removeEventListener("pointerdown", this.onActive, true);
        window.removeEventListener("pointermove", this.onMove);
        window.removeEventListener("resize", this.onResize);
        this.el?.remove(); this.el = null;
        this.preload = null;
    },

    onSettingChange() { if (this.started && this.el) this.layout(); },

    settingsPanel() {
        const link = (text: string, url: string) => h("a", { href: url, onclick: (e: Event) => { e.preventDefault(); native.openUrl(url); } }, text);
        return h("div", { style: { fontSize: "13px", lineHeight: "1.5", color: "var(--text-muted)" } },
            h("p", { style: { margin: "0 0 6px" } }, "Capri's art and animations are from ", link("Capri Desktop", REPO),
                " by lachydotmcg and its artists, used under PolyForm Noncommercial 1.0.0. They load from that project's GitHub."),
            h("p", { style: { margin: 0 } }, "Capri is an unofficial fan project, not approved or endorsed by CD PROJEKT RED. Want the full version (voice, calls, games)? Get it from ",
                link("capri-desktop", REPO), "."));
    },
});
