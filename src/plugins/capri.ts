/*
 * Capri: a desktop mate that lives inside Discord's window (and only there).
 * Her art and animations are the Capri Desktop project's sprite sheets by lachydotmcg and her artists
 * (https://github.com/lachydotmcg/capri-desktop), used under PolyForm Noncommercial 1.0.0 with credit.
 * They load from that repo at runtime and aren't bundled with Vanta.
 *
 * She floats around the window, drifts between Discord's panels and sits on their edges, glitches from place to
 * place, lies down, dances to your music, naps, and can be picked
 * up and thrown. Only her actual pixels catch the mouse, so she never blocks clicks around her.
 */
import { definePlugin, common, webpack, onFlux, storage, native, h, discord } from "@api";

const REPO = "https://github.com/lachydotmcg/capri-desktop";
const SHEETS = "https://raw.githubusercontent.com/lachydotmcg/capri-desktop/main/assets/sprites/";

type Fam = "stand" | "sit" | "lie";
interface Clip {
    file: string; n: number; fps: number; w: number; h: number;
    /** anchor in the cell: feet when standing, seat when sitting, hip on the ledge when lying, hand when held */
    ax: number; ay: number;
    /** her size multiplier for this set (the artist's sets are drawn at different scales) */
    unit: number;
    /** has a _flipped sheet for facing left (otherwise mirrored with CSS) */
    flips?: boolean;
}
const st = (file: string, n: number, fps: number, extra: Partial<Clip> = {}): Clip =>
    ({ file, n, fps, w: 240, h: 384, ax: 120, ay: 363, unit: 1.11, ...extra });
const sit = (file: string, n: number, fps: number, w = 196): Clip =>
    ({ file, n, fps, w, h: 384, ax: 70, ay: 262, unit: 1, flips: true });
const lie = (file: string, n: number, fps: number): Clip =>
    ({ file, n, fps, w: 372, h: 250, ax: 303, ay: 112, unit: 0.85, flips: true });

const CLIPS = {
    idle: st("idle", 60, 24, { w: 116, ax: 47, flips: true }),
    glitch: st("glitch", 10, 15),
    grin: st("grin", 16, 8),
    dance: st("dance", 16, 16),
    sleep: st("sleep", 16, 6),
    wake: st("wake", 13, 15),
    arrive: st("arrive", 14, 15),
    leave: st("leave", 12, 15),
    held: st("dangle", 24, 10, { ay: 40 }), // held by the hand
    fall: st("dangle", 24, 10, { ay: 370 }), // same pictures, placed by her feet
    perch: sit("perch", 60, 30),
    perchTalk: sit("perch_talk", 60, 30),
    perchMusic: sit("perch_music", 60, 30),
    perchGlitch: sit("perch_glitch", 10, 15, 288),
    perchArrive: sit("perch_arrive", 14, 15, 288),
    perchLeave: sit("perch_leave", 12, 15, 288),
    lie: lie("laydown", 60, 30),
    lieTalk: lie("laydown_talk", 60, 30),
    lieSleep: lie("laydown_sleep", 60, 30),
    lieGlitch: lie("laydown_glitch", 10, 15),
    lieLeave: lie("laydown_leave", 12, 15),
} satisfies Record<string, Clip>;
type ClipName = keyof typeof CLIPS;

/** Tops of Discord's panels she can sit on */
const LEDGES = [
    'form [class*="channelTextArea_"]',
    'section[class*="panels_"]',
    '[class*="membersWrap_"]',
    '[class*="profilePanel_"]',
    '[class*="userPanelOuter_"]',
    '[class*="searchResultsWrap_"]',
];
interface Ledge { el: Element | null; left: number; right: number; top: number }

const GRAVITY = 2600;
/** Her voice tuning, from Capri Desktop's defaults: her own style's speed, 1.2x, 80% volume. Pitch is a setting. */
const VOICE = { styleSpeed: 1.1, speed: 1.2, volume: 0.8 };
/** Capri Desktop's own personality and safety lines, read from its source at runtime (see loadPersona) */
const BRAIN_URL = "https://raw.githubusercontent.com/lachydotmcg/capri-desktop/main/app/Brain.cs";

/** Splits a line into sentences, so the first one can play while the rest are made */
function sentences(text: string): string[] {
    const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
    const out: string[] = [];
    for (const p of parts) {
        // Glue very short bits onto the previous sentence ("Ha." "Nice.")
        if (out.length && (p.length < 18 || out[out.length - 1].length < 18) && out[out.length - 1].length + p.length < 140) out[out.length - 1] += " " + p;
        else out.push(p);
    }
    return out;
}

/** Turns a Discord message into something nice to read out loud */
function speakable(content: string, resolve: { user(id: string): string; channel(id: string): string; role(id: string): string }) {
    return String(content || "")
        .replace(/<@!?(\d+)>/g, (_, id) => "@" + resolve.user(id))
        .replace(/<#(\d+)>/g, (_, id) => "#" + resolve.channel(id))
        .replace(/<@&(\d+)>/g, (_, id) => "@" + resolve.role(id))
        .replace(/<a?:(\w+):\d+>/g, "$1")
        .replace(/<t:\d+(:\w)?>/g, "a time")
        .replace(/https?:\/\/\S+/g, "a link")
        .replace(/```[\s\S]*?```/g, "some code")
        .replace(/[*_~`|>#]+/g, "")
        .replace(/\s+/g, " ").trim().slice(0, 220);
}


const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(weighted: [T, number][]): T => {
    let r = Math.random() * weighted.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of weighted) if ((r -= w) <= 0) return v;
    return weighted[weighted.length - 1][0];
};

export default definePlugin({
    name: "Capri",
    description: "Capri, the desktop mate, lives in your Discord window: she floats around, sits on panel edges, lies down, dances to your music, naps and talks. Pick her up and throw her. Art from the Capri Desktop project.",
    authors: ["Vanta"], category: "Appearance", since: "0.5.3",
    needsWebpack: true,
    options: {
        size: { type: "number", default: 0.5, label: "Size", description: "0.3 to 1" },
        wander: { type: "boolean", default: true, label: "Wander around on her own" },
        talk: { type: "boolean", default: true, label: "Talk when messages arrive" },
        naps: { type: "boolean", default: true, label: "Nap when you're away" },
        napAfter: { type: "number", default: 3, label: "Nap after (minutes)" },
        color: { type: "select", default: "default", label: "Colours", options: [{ value: "default", label: "Her own" }, { value: "bubblegum", label: "Bubblegum" }, { value: "cyan", label: "Cyber cyan" }, { value: "royal", label: "Royal" }, { value: "toxic", label: "Toxic" }, { value: "gold", label: "Gold" }, { value: "ghost", label: "Ghost" }, { value: "custom", label: "Custom hue" }] },
        hue: { type: "number", default: 0, label: "Custom hue (degrees)", description: "0 to 360, used when Colours is Custom hue." },
        glow: { type: "boolean", default: true, label: "Glow" },
        voice: { type: "boolean", default: true, label: "Speak out loud", description: "In her own voice, from the Capri Desktop voice pack." },
        fx: { type: "number", default: 70, label: "Voice effects", description: "0 to 100: her holographic shimmer, echoes and glitches. 0 is her plain voice." },
        pitch: { type: "number", default: 4, label: "Voice pitch (semitones)", description: "-2 to 8. Higher is squeakier." },
        readPings: { type: "boolean", default: true, label: "Read out pings and mentions" },
        readDMs: { type: "boolean", default: true, label: "Read out DMs" },
        quietOnDnd: { type: "boolean", default: false, label: "Don't read them out on Do Not Disturb" },
        comments: { type: "boolean", default: true, label: "Comment on what you're doing", description: "Channels you open, calls you join, songs you play." },
        ownMessages: { type: "boolean", default: false, label: "React to messages you send", description: "With an API key set, the message is sent to Anthropic so she can reply to it." },
        chatty: { type: "select", default: "normal", label: "How often she comments", options: [{ value: "quiet", label: "Now and then" }, { value: "normal", label: "Normal" }, { value: "chatty", label: "A lot" }] },
    },

    // ---------- drawing ----------
    S() { return 340 * Math.max(0.3, Math.min(1, Number(this.settings.size) || 0.5)); },
    k(c: Clip) { return c.unit * this.S() / 384; },

    sheet(c: Clip, flipped: boolean): HTMLImageElement {
        const file = c.file + (flipped ? "_flipped" : "");
        let img = this.images.get(file);
        if (!img) {
            img = new Image();
            img.crossOrigin = "anonymous"; // so her pixels can be read for hit-testing
            img.src = SHEETS + file + ".png";
            this.images.set(file, img);
        }
        return img;
    },

    /** Switches animation. `then` runs when a one-shot clip ends; without it the clip loops. */
    play(name: ClipName, then?: () => void) {
        const c: Clip = CLIPS[name];
        const flipped = !!c.flips && this.dir < 0;
        const img = this.sheet(c, flipped);
        this.clipName = name; this.clip = c; this.flipped = flipped; this.then = then ?? null;
        this.frame = -1; this.clipT = performance.now();
        this.waiting = !img.complete;
        if (this.waiting) img.decode().catch(() => { }).finally(() => { if (this.clip === c) { this.waiting = false; this.clipT = performance.now(); this.applySheet(); } });
        else this.applySheet();
    },

    applySheet() {
        const c: Clip = this.clip, k = this.k(c);
        const img = this.sheet(c, this.flipped);
        Object.assign(this.el.style, {
            width: c.w * k + "px", height: c.h * k + "px",
            backgroundImage: `url("${img.src}")`, backgroundSize: `${c.w * c.n * k}px ${c.h * k}px`,
        });
        this.frame = -1;
        this.draw(performance.now());
    },

    draw(now: number) {
        const c: Clip = this.clip;
        if (!c || this.waiting) return;
        let f = Math.floor((now - this.clipT) / 1000 * c.fps);
        if (this.then && f >= c.n) {
            const then = this.then; this.then = null;
            f = c.n - 1;
            queueMicrotask(then);
        } else f %= c.n;
        const k = this.k(c);
        if (f !== this.frame) { this.frame = f; this.el.style.backgroundPositionX = -f * c.w * k + "px"; }
        const mirror = !c.flips && this.dir < 0;
        const ax = (this.flipped ? c.w - c.ax : c.ax) * k;
        const left = this.x - (mirror ? c.w * k - ax : ax), top = this.y + (this.bob || 0) - c.ay * k;
        this.box = { left, top, w: c.w * k, h: c.h * k, mirror };
        this.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)${mirror ? " scaleX(-1)" : ""}`;
        if (this.bubble && !this.bubble.hidden) this.placeBubble();
    },

    /** Is the point on one of her (non-transparent) pixels? */
    hit(px: number, py: number) {
        const b = this.box, c: Clip = this.clip;
        if (!b || !c || this.pose === "gone" || px < b.left || py < b.top || px > b.left + b.w || py > b.top + b.h) return false;
        const k = this.k(c);
        let lx = (px - b.left) / k;
        if (b.mirror) lx = c.w - lx;
        const img = this.sheet(c, this.flipped);
        if (!img.complete || !img.naturalWidth) return true;
        try {
            this.ctx.clearRect(0, 0, 1, 1);
            this.ctx.drawImage(img, Math.floor(this.frame * c.w + lx), Math.floor((py - b.top) / k), 1, 1, 0, 0, 1, 1);
            return this.ctx.getImageData(0, 0, 1, 1).data[3] > 40;
        } catch { return true; }
    },

    // ---------- the world ----------
    floor(): Ledge { return { el: null, left: 0, right: window.innerWidth, top: window.innerHeight - 1 }; },

    ledges(): Ledge[] {
        const out: Ledge[] = [];
        for (const sel of LEDGES) for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            if (r.width < 120 || r.height < 20 || r.top < 60 || r.top > window.innerHeight - 40) continue;
            out.push({ el, left: r.left, right: r.right, top: r.top });
        }
        return out;
    },

    /** The surface she's on right now (re-measured, since panels move and resize) */
    ground(): Ledge | null {
        if (!this.on) return null;
        if (!this.on.el) return this.floor();
        const el = this.on.el;
        if (!el.isConnected) return null;
        const r = el.getBoundingClientRect();
        if (!r.width) return null;
        return { el, left: r.left, right: r.right, top: r.top };
    },

    /** The highest surface she'd land on when falling from prevY to y at x */
    landing(x: number, prevY: number, y: number): Ledge | null {
        let best: Ledge | null = null;
        for (const l of this.ledges()) if (x > l.left + 10 && x < l.right - 10 && prevY <= l.top && y >= l.top && (!best || l.top < best.top)) best = l;
        if (!best && y >= this.floor().top) best = this.floor();
        return best;
    },

    // ---------- behaviour ----------
    setOn(l: Ledge | null) {
        this.on = l;
        this.save();
    },

    save() {
        storage.set("Capri", { x: this.x / window.innerWidth, y: this.y / window.innerHeight }, 3000);
    },

    // Capri doesn't walk: she floats. "stand" = hovering in the air (bobbing), "sit"/"lie" = on a panel's edge.
    standIdle() { this.pose = "stand"; this.action = "idle"; this.on = null; this.play("idle"); this.think = performance.now() + rand(3000, 8000); },

    /** Where she may float (her anchor is at her feet) */
    bounds() {
        const h = this.S() * 1.11 * 0.9;
        return { left: 50, right: window.innerWidth - 50, top: Math.min(window.innerHeight - 40, 70 + h), bottom: window.innerHeight - 24 };
    },

    /** Glides to a point; `then` runs when she gets there */
    driftTo(x: number, y: number, then?: () => void) {
        const b = this.bounds();
        this.pose = "stand"; this.action = "drift"; this.on = null;
        this.target = { x: Math.max(b.left, Math.min(b.right, x)), y: Math.max(b.top, Math.min(b.bottom, y)), from: { x: this.x, y: this.y }, t0: performance.now(), then };
        const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        this.target.ms = Math.max(600, dist / (this.S() * 0.55) * 1000); // a calm glide, ~half her height a second
        if (Math.abs(this.target.x - this.x) > 20) this.dir = this.target.x < this.x ? -1 : 1;
        if (this.clipName !== "idle" && this.clipName !== "dance") this.play("idle");
    },

    sitDown(l?: Ledge) {
        const ledge = l ?? this.ledges()[Math.floor(Math.random() * this.ledges().length)];
        if (!ledge) return this.standIdle();
        // Float over to the panel, then sit on its edge
        this.driftTo(rand(ledge.left + 40, ledge.right - 40), ledge.top, () => {
            const g = ledge.el && ledge.el.isConnected ? ledge.el.getBoundingClientRect() : null;
            if (!g || !g.width) return this.standIdle();
            this.y = g.top; this.on = { el: ledge.el, left: g.left, right: g.right, top: g.top };
            this.pose = "busy";
            this.play("perchArrive", () => { this.pose = "sit"; this.satAt = performance.now(); this.restSit(); this.save(); });
        });
    },
    restSit() {
        this.play(this.music ? "perchMusic" : "perch");
        this.think = performance.now() + rand(15000, 40000);
    },
    standUp() {
        this.pose = "busy";
        this.play("perchLeave", () => { this.y -= this.S() * 0.25; this.standIdle(); }); // lifts off the edge
    },
    lieDown() {
        this.pose = "lie";
        this.play(this.asleep ? "lieSleep" : "lie");
        this.think = performance.now() + rand(25000, 70000);
    },
    sitUp() {
        this.pose = "busy";
        this.play("lieLeave", () => { this.pose = "sit"; this.restSit(); });
    },

    /** Glitch out, then back in somewhere else */
    teleport(x: number, y: number) {
        this.pose = "busy";
        this.play("leave", () => {
            this.pose = "gone";
            this.el.style.visibility = "hidden";
            setTimeout(() => {
                if (!this.el) return;
                const b = this.bounds();
                this.x = Math.max(b.left, Math.min(b.right, x)); this.y = Math.max(b.top, Math.min(b.bottom, y));
                this.on = null;
                this.el.style.visibility = "";
                this.pose = "busy";
                this.play("arrive", () => { this.standIdle(); this.save(); });
            }, rand(250, 700));
        });
    },

    /** Thrown: she tumbles, slows down and hovers again (no gravity: she floats) */
    fallFrom(vx = 0, vy = 0) {
        this.pose = "air"; this.vx = vx; this.vy = vy; this.on = null;
        if (Math.abs(vx) > 60) this.dir = vx < 0 ? -1 : 1;
        this.play("fall");
    },

    /** Picks something to do. Runs when the current activity's time is up. */
    decide() {
        const now = performance.now();
        if (!this.settings.wander && this.pose !== "lie") { this.think = now + 10000; return; }
        if (this.pose === "stand") {
            const ledges = this.ledges();
            const b = this.bounds();
            const choice = pick<string>([
                ["drift", 45], ["idle", 20], ["grin", 6],
                ["dance", this.music ? 35 : 0],
                ["sit", ledges.length ? 25 : 0],
                ["hop", 8],
            ]);
            if (choice === "drift") {
                const span = this.S() * 2.2;
                return this.driftTo(this.x + rand(-span, span), this.y + rand(-span * 0.6, span * 0.6));
            }
            if (choice === "sit") return this.sitDown();
            if (choice === "hop") return this.teleport(rand(b.left, b.right), rand(b.top, b.bottom));
            if (choice === "dance") { this.play("dance"); this.think = now + rand(8000, 20000); return; }
            if (choice === "grin") { this.pose = "busy"; this.play("grin", () => this.standIdle()); return; }
            return this.standIdle();
        }
        if (this.pose === "sit") {
            const sat = now - this.satAt;
            if (!this.music && sat > 30000 && Math.random() < 0.45) return this.lieDown();
            if (Math.random() < 0.55) return this.standUp();
            return this.restSit();
        }
        if (this.pose === "lie") {
            if (this.asleep) { this.think = now + 20000; return; }
            return this.sitUp();
        }
    },

    // ---------- the loop ----------
    loop(now: number) {
        this.raf = requestAnimationFrame(t => this.loop(t));
        const dt = Math.max(0, Math.min(0.05, (now - (this.last || now)) / 1000));
        this.last = now;
        const b = this.bounds();

        if (this.pose === "air") {
            // Air drag instead of gravity: a throw slows to a hover
            const drag = Math.exp(-2.6 * dt);
            this.vx *= drag; this.vy *= drag;
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (this.x < b.left || this.x > b.right) { this.vx *= -0.6; this.x = Math.max(b.left, Math.min(b.right, this.x)); }
            if (this.y < b.top || this.y > b.bottom) { this.vy *= -0.6; this.y = Math.max(b.top, Math.min(b.bottom, this.y)); }
            if (Math.hypot(this.vx, this.vy) < 40) { this.vx = this.vy = 0; this.pose = "busy"; this.play("glitch", () => { this.standIdle(); this.save(); }); }
        } else if (this.pose === "sit" || this.pose === "lie" || (this.pose === "busy" && this.on)) {
            // On a panel's edge: follow it as it moves; if it's gone, float up
            const g = this.ground();
            if (!g) { this.y -= this.S() * 0.2; this.standIdle(); }
            else { this.y = g.top; this.x = Math.max(g.left + 12, Math.min(g.right - 12, this.x)); }
        } else if (this.pose === "stand" && this.action === "drift" && this.target) {
            // Eased glide (slow start, slow stop)
            const t = Math.min(1, (now - this.target.t0) / this.target.ms);
            const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            this.x = this.target.from.x + (this.target.x - this.target.from.x) * e;
            this.y = this.target.from.y + (this.target.y - this.target.from.y) * e;
            if (t >= 1) {
                const then = this.target.then; this.target = null; this.action = "idle";
                this.think = now + rand(2500, 7000);
                if (then) then(); else this.save();
            }
        } else if (this.pose === "stand" || this.pose === "busy") {
            // Keep her inside the window if it was resized
            this.x = Math.max(b.left, Math.min(b.right, this.x)); this.y = Math.max(b.top, Math.min(b.bottom, this.y));
        }
        // A gentle hover bob while she's in the air (not when sitting or held)
        const floating = this.pose === "stand" || (this.pose === "busy" && !this.on) || this.pose === "air";
        this.bob = floating ? Math.sin(now / 650) * this.S() * 0.025 : 0;
        if ((this.pose === "stand" || this.pose === "sit" || this.pose === "lie") && this.action !== "drift" && now >= this.think) this.decide();
        this.draw(now);
    },

    // ---------- moods ----------
    wake() {
        this.lastActive = Date.now();
        if (!this.asleep) return;
        this.asleep = false;
        if (this.settings.comments) setTimeout(() => this.say(["oh! you're back.", "mm... was i asleep? i was totally not asleep.", "welcome back! i missed you. a little."][Math.floor(Math.random() * 3)]), 1500);
        if (this.pose === "lie") this.play("lie");
        else if (this.clipName === "sleep") { this.pose = "busy"; this.play("wake", () => this.standIdle()); }
    },

    nap() {
        this.asleep = true;
        if (this.pose === "lie") this.play("lieSleep");
        else if (this.pose === "sit") { this.pose = "lie"; this.play("lieSleep"); this.think = Infinity; }
        else if (this.pose === "stand") { this.action = "idle"; this.pose = "busy"; this.play("sleep"); }
    },

    /** Moves her mouth for a while (talk clips sitting or lying, a grin standing) */
    talk(ms = 2600) {
        if (this.asleep) return;
        if (this.pose === "sit") { this.play("perchTalk"); this.think = performance.now() + ms; }
        else if (this.pose === "lie") { this.play("lieTalk"); this.think = performance.now() + ms; }
        else if (this.pose === "stand" && this.action === "idle") { this.pose = "busy"; this.play("grin", () => this.standIdle()); }
    },

    // ---------- talking ----------
    /**
     * Shows a line in her speech bubble right away (typed out) and speaks it in her voice.
     * `queue` (pings and DMs): the text still shows at once, and its audio starts being made at once, but it plays after
     * whatever she's saying instead of cutting it off.
     */
    say(text: string, queue = false) {
        text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 280);
        if (!text || !this.el) return;
        this.wake();
        this.closeInput();
        clearTimeout(this.bubbleT); clearInterval(this.typeT);
        const b = this.bubble;
        b.textContent = "";
        b.hidden = false;
        let i = 0;
        // Typed out quickly: 2 characters a tick, so long lines don't lag behind
        this.typeT = setInterval(() => { i += 2; b.textContent = text.slice(0, i); if (i >= text.length) clearInterval(this.typeT); this.placeBubble(); }, 16);
        this.bubbleT = setTimeout(() => { if (!this.input) b.hidden = true; }, 4000 + text.length * 55);
        this.placeBubble();
        if (this.settings.voice) this.speak(text, queue);
        else this.talk(Math.min(9000, 1200 + text.length * 55));
    },

    /**
     * Her own voice (Kokoro + her voice from the Capri Desktop pack), with the system voice as a fallback.
     * Sentence by sentence: each plays as soon as it's ready while the next ones are made.
     */
    async speak(text: string, queue = false) {
        if (!queue) {
            // A fresh line: stop what she's saying and drop anything still waiting
            this.lineNo++;
            for (const s of this.sources ?? []) try { s.stop(); } catch { }
            this.sources = [];
            this.playAt = 0;
            this.genChain = Promise.resolve();
            if ("speechSynthesis" in window) speechSynthesis.cancel();
        }
        const line = this.lineNo;
        // Like Capri Desktop: Kokoro makes the line a little slower and faster playback raises the pitch, landing on 1.2x
        const semis = Math.max(-2, Math.min(8, Number(this.settings.pitch ?? 4)));
        const ratio = 2 ** (semis / 12);
        const speed = Math.max(0.6, Math.min(1.6, VOICE.styleSpeed * VOICE.speed / ratio));
        // Ask for every sentence now, in order (the voice works on one at a time)
        const made = sentences(text).map(p => {
            const g = this.genChain.then(() => native.voiceSpeak(p, speed));
            this.genChain = g.catch(() => { });
            return g;
        });
        try {
            this.ac ??= new AudioContext();
            if (this.ac.state === "suspended") this.ac.resume().catch(() => { });
            for (const g of made) {
                const { audio, rate } = await g;
                if (line !== this.lineNo || !this.el) return; // a newer line started meanwhile
                const buf = this.ac.createBuffer(1, audio.length, rate);
                buf.copyToChannel(audio instanceof Float32Array ? audio : new Float32Array(audio), 0);
                const src = this.ac.createBufferSource();
                src.buffer = buf;
                src.playbackRate.value = ratio;
                // Through her holographic voice chain, with a few glitches on this sentence
                const flicker = this.ac.createGain();
                src.connect(flicker).connect(this.voiceBus().input);
                const start = Math.max(this.ac.currentTime + 0.02, this.playAt || 0);
                src.start(start);
                this.glitchVoice(src, flicker, start, buf.duration / ratio, text);
                this.sources.push(src);
                this.playAt = start + buf.duration / ratio;
                const leftMs = (this.playAt - this.ac.currentTime) * 1000;
                this.talk(leftMs + 150); // mouth moves for as long as she speaks
                clearTimeout(this.bubbleT);
                this.bubbleT = setTimeout(() => { if (!this.input) this.bubble.hidden = true; }, leftMs + 1800);
            }
        } catch (e) {
            if (line !== this.lineNo) return;
            this.logger.warn("Her voice failed, using the system voice:", e);
            this.talk(Math.min(9000, 1200 + text.length * 55));
            if (!("speechSynthesis" in window)) return;
            const u = new SpeechSynthesisUtterance(text);
            u.voice = speechSynthesis.getVoices().find(v => /zira|aria|jenny|female|samantha/i.test(v.name)) ?? null;
            u.rate = 1.05; u.pitch = 1.3;
            speechSynthesis.speak(u); // queues after anything already speaking
        }
    },

    // ---------- her holographic voice ----------
    /**
     * Light, airy and crystalline, with a synthetic shimmer, faint metallic overtones, spectral echoes and glitches.
     * One shared chain (built once): airy EQ → dry, plus a chorus (holographic doubling), a ring modulator (metallic
     * sparkle) and a filtered echo, mixed by the "Voice effects" strength.
     */
    voiceBus() {
        if (this.bus && this.bus.ac === this.ac) { this.bus.set(); return this.bus; }
        const ac: AudioContext = this.ac;
        const input = ac.createGain();
        const out = ac.createGain();
        out.gain.value = VOICE.volume;
        out.connect(ac.destination);
        // Airy: trim the lows, lift the highs a little
        const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 150;
        const air = ac.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = 4800; air.gain.value = 5;
        input.connect(hp).connect(air);
        const dry = ac.createGain();
        air.connect(dry).connect(out);
        // Holographic doubling: a slightly delayed copy whose delay wobbles
        const cd = ac.createDelay(0.05); cd.delayTime.value = 0.013;
        const lfo = ac.createOscillator(); lfo.frequency.value = 0.7;
        const lfoDepth = ac.createGain(); lfoDepth.gain.value = 0.0035;
        lfo.connect(lfoDepth).connect(cd.delayTime); lfo.start();
        const chorus = ac.createGain();
        air.connect(cd).connect(chorus).connect(out);
        // Metallic overtones: ring modulation, kept high and quiet
        const ring = ac.createGain(); ring.gain.value = 0;
        const carrier = ac.createOscillator(); carrier.frequency.value = 1350; carrier.connect(ring.gain); carrier.start();
        const ringHp = ac.createBiquadFilter(); ringHp.type = "highpass"; ringHp.frequency.value = 2000;
        const metal = ac.createGain();
        air.connect(ring).connect(ringHp).connect(metal).connect(out);
        // Spectral echoes: a short, darkening echo
        const ed = ac.createDelay(1); ed.delayTime.value = 0.13;
        const fb = ac.createGain(); fb.gain.value = 0.3;
        const elp = ac.createBiquadFilter(); elp.type = "lowpass"; elp.frequency.value = 4500;
        air.connect(ed); ed.connect(elp).connect(fb).connect(ed);
        const echo = ac.createGain();
        elp.connect(echo).connect(out);
        const self = this;
        this.bus = {
            ac, input, out,
            set() {
                const f = Math.max(0, Math.min(100, Number(self.settings.fx ?? 70))) / 100;
                chorus.gain.value = 0.5 * f; metal.gain.value = 0.16 * f; echo.gain.value = 0.22 * f;
                air.gain.value = 2 + 4 * f;
            },
        };
        this.bus.set();
        return this.bus;
    },

    /** Little glitches on a sentence: pitch warps, dropouts and static, more when she's being cheeky */
    glitchVoice(src: AudioBufferSourceNode, flicker: GainNode, start: number, dur: number, text: string) {
        const f = Math.max(0, Math.min(100, Number(this.settings.fx ?? 70))) / 100;
        if (!f) return;
        const cheeky = /[!~]|\b(he+h|ha(ha)+|hehe|oops|gotcha|nope|corpo|arasaka)\b/i.test(text);
        const n = Math.min(6, Math.round(f * (0.6 + dur * 0.5) * (cheeky ? 1.7 : 1)));
        const ac: AudioContext = this.ac;
        for (let i = 0; i < n; i++) {
            const t = start + 0.15 + Math.random() * Math.max(0.1, dur - 0.3);
            const len = 0.03 + Math.random() * 0.05;
            const kind = Math.random();
            if (kind < 0.45) { // a quick pitch warp
                src.detune.setValueAtTime((Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 140) * f, t);
                src.detune.setValueAtTime(0, t + len);
            } else if (kind < 0.75) { // a dropout, like a flicker in the projection
                flicker.gain.setValueAtTime(0.2, t);
                flicker.gain.setValueAtTime(1, t + len * 0.7);
            } else { // a crackle of static
                const noise = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
                const d = noise.getChannelData(0);
                for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.2);
                const ns = ac.createBufferSource(); ns.buffer = noise;
                const nhp = ac.createBiquadFilter(); nhp.type = "highpass"; nhp.frequency.value = 3500;
                const ng = ac.createGain(); ng.gain.value = 0.05 * f;
                ns.connect(nhp).connect(ng).connect(this.voiceBus().out);
                ns.start(t);
            }
        }
    },

    // ---------- her look ----------
    /** Colour presets (hue shifts from her own red and green), plus a custom hue */
    look() {
        const presets: Record<string, { filter: string; accent: string }> = {
            default: { filter: "", accent: "#ff2a6d" },
            bubblegum: { filter: "hue-rotate(-28deg) saturate(1.15) brightness(1.08)", accent: "#ff5fb8" },
            cyan: { filter: "hue-rotate(175deg) saturate(1.2)", accent: "#05d9e8" },
            royal: { filter: "hue-rotate(-95deg) saturate(1.1)", accent: "#8f5bff" },
            toxic: { filter: "hue-rotate(105deg) saturate(1.3)", accent: "#7dff3a" },
            gold: { filter: "hue-rotate(40deg) saturate(1.25) brightness(1.08)", accent: "#ffc23a" },
            ghost: { filter: "grayscale(0.85) brightness(1.25)", accent: "#cfd6e6" },
            custom: { filter: `hue-rotate(${Number(this.settings.hue) || 0}deg)`, accent: `hsl(${(345 + (Number(this.settings.hue) || 0)) % 360} 100% 58%)` },
        };
        return presets[this.settings.color as string] ?? presets.default;
    },
    applyLook() {
        if (!this.el) return;
        const { filter, accent } = this.look();
        const glow = this.settings.glow ? ` drop-shadow(0 0 ${Math.round(this.S() * 0.05)}px ${accent})` : "";
        this.el.style.filter = `${filter} drop-shadow(0 6px 8px rgba(0,0,0,.35))${glow}`.trim();
        this.bubble?.style.setProperty("--capri-accent", accent);
    },

    /** Keeps the bubble above her head, inside the window */
    placeBubble() {
        const b = this.bubble, box = this.box;
        if (!b || b.hidden || !box) return;
        const w = b.offsetWidth, hgt = b.offsetHeight;
        const cx = this.x, top = box.top + box.h * 0.08;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, cx - w / 2));
        const y = Math.max(40, top - hgt - 6);
        b.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
    },

    /** Clicking her: a little text box to talk to her */
    openInput() {
        if (this.input) { this.input.focus(); return; }
        clearTimeout(this.bubbleT); clearInterval(this.typeT);
        const b = this.bubble;
        b.hidden = false;
        b.textContent = "";
        const input = h("input", { type: "text", placeholder: "Say something to Capri…", maxLength: 300, class: "vanta-capri-input" }) as HTMLInputElement;
        input.addEventListener("keydown", (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Escape") { this.closeInput(); b.hidden = true; }
            if (e.key === "Enter" && input.value.trim()) { const text = input.value.trim(); this.closeInput(); this.reply(text); }
        });
        input.addEventListener("blur", () => setTimeout(() => { if (this.input === input && !input.value) { this.closeInput(); b.hidden = true; } }, 150));
        b.append(input);
        this.input = input;
        this.placeBubble();
        setTimeout(() => input.focus(), 0);
    },
    closeInput() { this.input?.remove(); this.input = null; },

    /**
     * Her personality is Capri Desktop's own (with its safety lines), read from its source on GitHub and kept for a week,
     * so she's the same Capri as in the desktop app. It isn't copied into Vanta: it stays under that project's licence.
     */
    async loadPersona() {
        const cached = await storage.get<{ at: number; text: string }>("CapriPersona");
        if (cached?.text) this.desktopPersona = cached.text;
        if (cached?.text && Date.now() - cached.at < 7 * 86_400_000) return;
        try {
            const src = await native.fetchText(BRAIN_URL);
            const grab = (name: string) => {
                const i = src.indexOf(`internal const string ${name} =`);
                if (i < 0) return "";
                const body = src.slice(i, src.indexOf('";', i) + 1);
                return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join("")
                    .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
            };
            const text = [grab("DefaultPersonality"), grab("Safety"),
                grab("Machinery").replace(/\n?Only if they say your voice[\s\S]*$/, "").trim()].join("\n");
            if (!text.startsWith("You are Capri") || text.length < 800) throw new Error("unexpected format");
            this.desktopPersona = text;
            storage.set("CapriPersona", { at: Date.now(), text }, 0);
        } catch (e) { this.logger.warn("Couldn't load Capri Desktop's personality, using a short one:", e); }
    },

    persona() {
        const me = common.UserStore?.getCurrentUser?.();
        const name = me?.globalName || me?.username || "them";
        const here = `\nWhere you are now: inside ${name}'s Discord app, as a desktop mate added by the Vanta client mod, not on their desktop and not riding their cursor. ` +
            `You float around their Discord window, sit on the edges of its panels, nap and dance to their music. You only know the notes you're given about what's happening in Discord; never guess the rest.`;
        if (this.desktopPersona) return this.desktopPersona + here;
        return `You are Capri, a glitchy personality construct from Night City. A playful chaos gremlin: sarcastic, teasing, a little smug, never mean, openly fond of ${name}. ` +
            `Talk like a friend texting, never like an assistant. One short line under 25 words, plain text, no emoji or asterisks. Use Night City slang like choom only now and then.` + here;
    },

    /** Gets her reply from Claude (or a canned one without a key) and says it */
    async reply(userText: string) {
        if (this.tryAction(userText) || this.trySend(userText)) return;
        this.history.push({ role: "user", content: userText });
        if (this.history.length > 16) this.history.splice(0, this.history.length - 16);
        // She heard you: a thinking bubble until the answer comes
        clearTimeout(this.bubbleT); clearInterval(this.typeT);
        this.bubble.hidden = false;
        this.bubble.textContent = "…";
        this.placeBubble();
        this.talk(1500);
        const ask = this.history.length;
        try {
            const text = await native.aiChat(this.persona() + "\n" + this.context() +
                "\nThey're talking to you directly now. Always answer exactly what they just said or asked, straight away, in character. You can't send messages or take actions yourself; never say you did. If they want something done, tell them to say it plainly, like: send \"hi\" to name, reply to name saying hi, friend name, block name, delete my last message.", this.history, 150);
            this.history.push({ role: "assistant", content: text });
            this.say(text);
        } catch (e: any) {
            this.logger.warn("Her brain didn't answer:", e);
            this.history.splice(ask - 1, 1);
            this.say(["[SIGNAL CORRUPTED] ...my brain flatlined for a sec. say that again?",
                "ugh, static. the free brain's swamped right now, ask me again in a moment.",
                "hold on, my head's full of noise. try me again?"][Math.floor(Math.random() * 3)]);
        }
    },

    /** A line about what's going on right now, for her replies */
    context() {
        const ch = common.ChannelStore?.getChannel?.(common.SelectedChannelStore?.getChannelId?.());
        const guild = ch?.guild_id ? common.GuildStore?.getGuild?.(ch.guild_id)?.name : null;
        const where = ch ? (ch.name ? `#${ch.name}${guild ? ` in ${guild}` : ""}` : "a DM") : "their friends list";
        const song = this.song ? ` They're listening to ${this.song}.` : "";
        return `Right now they're looking at ${where}.${song}`;
    },

    /** Unprompted remark about something that just happened, with a cooldown */
    async remark(event: string, fallback: string[]) {
        if (!this.settings.comments || this.asleep || !this.el || this.input) return;
        const gap = { quiet: 240_000, normal: 90_000, chatty: 35_000 }[this.settings.chatty as string] ?? 90_000;
        const now = Date.now();
        if (now - (this.lastRemark || 0) < gap) return;
        if (Math.random() > ({ quiet: 0.35, normal: 0.6, chatty: 0.9 }[this.settings.chatty as string] ?? 0.6)) return;
        this.lastRemark = now;
        try {
            const text = await native.aiChat(this.persona() + "\n" + this.context(),
                [{ role: "user", content: `(Something just happened, react to it in one short line, maybe ask them about it: ${event})` }], 80);
            if (text) return this.say(text);
        } catch { }
        this.say(fallback[Math.floor(Math.random() * fallback.length)]);
    },

    // ---------- doing things for you ----------
    /** Anyone Discord knows about: your friends and DMs first, then people it has loaded (server members you've seen) */
    findAnyone(who: string): any[] {
        const first = this.findPeople(who);
        if (first.length) return first;
        const norm = (x: string) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const want = norm(who);
        if (!want) return [];
        const all = Object.values(common.UserStore?.getUsers?.() ?? {}) as any[];
        const names = (u: any) => [u.username, u.globalName, u.global_name].filter(Boolean).map(norm);
        const exact = all.filter(u => !u.bot && names(u).includes(want));
        return exact.length ? exact : all.filter(u => !u.bot && names(u).some((n: string) => n.startsWith(want))).slice(0, 5);
    },

    /** One person for a request, or she says why not */
    onePerson(who: string, anyone = false): any | null {
        const found = anyone ? this.findAnyone(who) : this.findPeople(who);
        const label = (u: any) => u.globalName || u.global_name || u.username;
        if (!found.length) { this.say(`who's ${who}? i can't find them${anyone ? "" : " in your friends or DMs"}.`); return null; }
        if (found.length > 1) { this.say(`which one? ${found.slice(0, 4).map(label).join(", ")}.`); return null; }
        return found[0];
    },

    /** Shows a question with Do it / Cancel in her bubble; nothing happens until you press it */
    confirmAction(question: string, yes: string, run: () => Promise<string>) {
        clearTimeout(this.bubbleT); clearInterval(this.typeT);
        const b = this.bubble;
        b.hidden = false;
        const done = (line: string) => { b.replaceChildren(); this.say(line); };
        const btn = (label: string, primary: boolean, fn: () => void) => h("button", {
            type: "button", onclick: fn,
            style: {
                marginRight: "6px", marginTop: "8px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--capri-accent, #ff2a6d)", cursor: "pointer", font: "inherit",
                background: primary ? "var(--capri-accent, #ff2a6d)" : "transparent", color: primary ? "#0c0a12" : "#f4eef7",
            },
        }, label);
        b.replaceChildren(h("div", {}, question), h("div", {},
            btn(yes, true, async () => {
                b.replaceChildren(h("div", {}, "on it…"));
                try { done(await run()); }
                catch (e: any) { done("couldn't do it: " + (e?.body?.message ?? e?.message ?? "Discord said no")); }
            }),
            btn("Cancel", false, () => done("okay, never mind."))));
        this.placeBubble();
        this.bubbleT = setTimeout(() => { if (b.querySelector("button")) { b.replaceChildren(); b.hidden = true; } }, 30_000);
        this.talk(1200);
    },

    /**
     * "friend 415i", "unfriend 415i", "block 415i", "unblock 415i", "delete my last message", "reply to 415i saying hi".
     * Returns true if it was one of these (she then asks before doing it).
     */
    tryAction(said: string): boolean {
        let t = said.trim()
            .replace(/^(hey|hi|yo|ok|okay)?\s*,?\s*capri\s*[,!:]?\s*/i, "")
            .replace(/^(can|could|would|will) (you|u|ya) (please |pls |plz )?/i, "")
            .replace(/^(please|pls|plz) /i, "")
            .replace(/[?!.]+$/, "").trim();
        for (let i = 0; i < 3; i++) t = t.replace(/[,\s]+(please|pls|plz|for me|rn|right now|now|thanks|thx|ty)$/i, "").trim();
        const label = (u: any) => u.globalName || u.global_name || u.username;
        const api = () => discord.api();
        let m: RegExpExecArray | null;

        if ((m = /^(?:unfriend|remove friend|remove|unadd)\s+@?(\S+)$/i.exec(t)) && !/^(my|the|that|this)$/i.test(m[1])) {
            const u = this.onePerson(m[1]); if (!u) return true;
            this.confirmAction(`remove ${label(u)} from your friends?`, "Remove", async () => { await api().del({ url: `/users/@me/relationships/${u.id}` }); return `done. ${label(u)} isn't your friend anymore.`; });
            return true;
        }
        if ((m = /^(?:friend|add|add friend|send (?:a )?friend request to|friend request)\s+@?(\S+)$/i.exec(t))) {
            const u = this.onePerson(m[1], true); if (!u) return true;
            this.confirmAction(`send ${label(u)} (@${u.username}) a friend request?`, "Send request", async () => { await api().put({ url: `/users/@me/relationships/${u.id}`, body: {} }); return `request sent to ${label(u)}.`; });
            return true;
        }
        if ((m = /^unblock\s+@?(\S+)$/i.exec(t))) {
            const u = this.onePerson(m[1], true); if (!u) return true;
            this.confirmAction(`unblock ${label(u)}?`, "Unblock", async () => { await api().del({ url: `/users/@me/relationships/${u.id}` }); return `${label(u)} is unblocked.`; });
            return true;
        }
        if ((m = /^block\s+@?(\S+)$/i.exec(t))) {
            const u = this.onePerson(m[1], true); if (!u) return true;
            this.confirmAction(`block ${label(u)}? they won't be able to message you.`, "Block", async () => { await api().put({ url: `/users/@me/relationships/${u.id}`, body: { type: 2 } }); return `blocked ${label(u)}.`; });
            return true;
        }
        if ((m = /^(?:delete|remove|unsend|undo)\s+(?:my\s+)?(?:last|latest|previous|recent)?\s*(?:message|msg|text)(?:\s+(?:in|to|with)\s+@?(\S+))?$/i.exec(t))) {
            let channelId = common.SelectedChannelStore?.getChannelId?.();
            if (m[1] && !/^(here|this)$/i.test(m[1])) {
                const u = this.onePerson(m[1]); if (!u) return true;
                channelId = common.ChannelStore?.getDMFromUserId?.(u.id);
            }
            if (!channelId) { this.say("delete it where? open the chat first."); return true; }
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const msgs: any[] = common.MessageStore?.getMessages?.(channelId)?._array ?? [];
            const mine = [...msgs].reverse().find(x => x.author?.id === me && !x.deleted);
            if (!mine) { this.say("i can't see a message from you there."); return true; }
            const preview = (mine.content || "[attachment]").slice(0, 60);
            this.confirmAction(`delete "${preview}${mine.content?.length > 60 ? "…" : ""}"?`, "Delete", async () => { await api().del({ url: `/channels/${channelId}/messages/${mine.id}` }); return "gone. nobody saw that. probably."; });
            return true;
        }
        if ((m = /^(?:reply|respond)\s+(?:to\s+)?@?(\S+?)[:,]?\s+(?:saying|with|that)?\s*(.+)$/i.exec(t))) {
            const who = m[1], text = m[2].replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
            if (!text || /^(me|you|u|it|this|that)$/i.test(who)) return false;
            const norm = (x: string) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const matches = (a: any) => [a?.username, a?.globalName, a?.global_name].filter(Boolean).map(norm).some((n: string) => n === norm(who) || n.startsWith(norm(who)));
            // Their latest message in the chat you have open, or else in your DMs with them
            const latestFrom = (ch?: string | null) => ch ? [...(common.MessageStore?.getMessages?.(ch)?._array ?? [])].reverse().find((x: any) => matches(x.author)) : null;
            let channelId = common.SelectedChannelStore?.getChannelId?.() ?? null;
            let target = latestFrom(channelId);
            if (!target) {
                const u = this.findPeople(who)[0];
                channelId = u ? common.ChannelStore?.getDMFromUserId?.(u.id) ?? null : null;
                target = latestFrom(channelId);
            }
            if (!target || !channelId) { this.say(`i can't see a message from ${who} to reply to. open the chat they wrote in first.`); return true; }
            const guildId = common.ChannelStore?.getChannel?.(channelId)?.guild_id;
            const quoted = (target.content || "[attachment]").slice(0, 40);
            this.confirmAction(`reply "${text}" to ${label(target.author)} ("${quoted}${target.content?.length > 40 ? "…" : ""}")?`, "Reply", async () => {
                const nonce = String(BigInt(Date.now() - 1420070400000) << 22n);
                const res = await api().post({ url: `/channels/${channelId}/messages`, body: { content: text, nonce, tts: false, flags: 0, message_reference: { message_id: target.id, channel_id: channelId, ...(guildId ? { guild_id: guildId } : {}) } } });
                if (!res?.body?.id) throw new Error("Discord didn't confirm the reply");
                return `replied to ${label(target.author)}.`;
            });
            return true;
        }
        return false;
    },

    // ---------- sending messages for you ----------
    /**
     * "send "hi" to 415i", "tell 415i that i'm late", "dm 415i hi", "send gm here".
     * Returns true if it was a send request (she then asks you to confirm before anything is sent).
     */
    trySend(said: string): boolean {
        let t = said.trim()
            .replace(/^(hey|hi|yo|ok|okay)?\s*,?\s*capri\s*[,!:]?\s*/i, "")
            .replace(/^(can|could|would|will) (you|u|ya) (please |pls |plz )?/i, "")
            .replace(/^(please|pls|plz) /i, "")
            .replace(/[?!.]+$/, "").trim();
        // Filler at the end: "… please", "… for me", "… rn"
        for (let i = 0; i < 3; i++) t = t.replace(/[,\s]+(please|pls|plz|for me|rn|right now|now|thanks|thx|ty|asap|real quick|quick|for me please)$/i, "").trim();
        const Q = "[\"“”'‘’]";
        const SAYING = "(?:saying|that says|which says|that|:|-|,)";
        const A_MSG = "(?:a\\s+(?:message|dm|text|msg)\\s+)?";
        const pats: [RegExp, number, number][] = [
            // send "hi" to 415i
            [new RegExp("^(?:send|say|dm|message|text)\\s+" + Q + "(.+)" + Q + "\\s+(?:to|for|in)\\s+(.+)$", "i"), 1, 2],
            // send a message to 415i saying hi / dm to 415i: hi
            [new RegExp("^(?:send|dm|message|text|tell)\\s+" + A_MSG + "to\\s+(\\S+?)\\s*" + SAYING + "\\s*(.+)$", "i"), 2, 1],
            // send 415i a message saying hi / dm 415i saying yo
            [new RegExp("^(?:send|dm|message|text|tell)\\s+(\\S+?)\\s+" + A_MSG + "(?:saying|that says|which says|that)\\s+(.+)$", "i"), 2, 1],
            // tell 415i "hi" / message 415i: hey / dm 415i yo
            [new RegExp("^(?:tell|dm|message|text|msg)\\s+(\\S+?)[:,-]?\\s+(.+)$", "i"), 2, 1],
            // send gm here
            [/^(?:send|say)\s+(.+?)\s+(here|in here)$/i, 1, 2],
            // send hi to 415i
            [/^(?:send|say)\s+(.+)\s+(?:to|in)\s+(\S+)$/i, 1, 2],
        ];
        for (const [re, ti, wi] of pats) {
            const m = re.exec(t);
            if (!m) continue;
            const text = m[ti].trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
            const who = m[wi].trim().replace(/^@/, "").replace(/[:,]+$/, "");
            if (!text || !who) continue;
            if (/^(me|us|you|u|ya|myself|yourself|her|him|them|it|a|an|the)$/i.test(who)) return false; // "tell me a joke" is just chat
            this.confirmSend(text, who);
            return true;
        }
        return false;
    },

    /** Finds who you mean among your friends and DMs (display name, username or the nickname you gave them) */
    findPeople(who: string): any[] {
        const norm = (x: string) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const want = norm(who);
        if (!want) return [];
        const ids = new Set<string>(common.RelationshipStore?.getFriendIDs?.() ?? []);
        for (const ch of Object.values(common.ChannelStore?.getMutablePrivateChannels?.() ?? {}) as any[])
            if (ch?.type === 1 && ch.recipients?.[0]) ids.add(ch.recipients[0]);
        const people = [...ids].map(id => common.UserStore?.getUser?.(id)).filter(Boolean);
        const names = (u: any) => [u.username, u.globalName, u.global_name, common.RelationshipStore?.getNickname?.(u.id)].filter(Boolean).map(norm);
        const exact = people.filter(u => names(u).includes(want));
        if (exact.length) return exact;
        const starts = people.filter(u => names(u).some((n: string) => n.startsWith(want)));
        return starts.length ? starts : people.filter(u => names(u).some((n: string) => n.includes(want)));
    },

    confirmSend(text: string, who: string) {
        let target: { label: string; channel: () => Promise<string> };
        if (/^(here|in here|this channel)$/i.test(who)) {
            const ch = common.SelectedChannelStore?.getChannelId?.();
            if (!ch) return this.say("send it where? open a channel first.");
            const c = common.ChannelStore?.getChannel?.(ch);
            target = { label: c?.name ? "#" + c.name : "this chat", channel: async () => ch };
        } else {
            const found = this.findPeople(who);
            if (!found.length) return this.say(`who's ${who}? i can't find them in your friends or DMs.`);
            if (found.length > 1) return this.say(`which one? ${found.slice(0, 4).map((u: any) => u.globalName || u.global_name || u.username).join(", ")}.`);
            const u = found[0];
            target = { label: u.globalName || u.global_name || u.username, channel: () => discord.dmChannel(u.id) };
        }
        // Ask first: nothing is sent until you press Send
        clearTimeout(this.bubbleT); clearInterval(this.typeT);
        const b = this.bubble;
        b.hidden = false;
        const done = (line: string) => { b.replaceChildren(); this.say(line); };
        const btn = (label: string, primary: boolean, fn: () => void) => h("button", {
            type: "button", onclick: fn,
            style: {
                marginRight: "6px", marginTop: "8px", padding: "3px 10px", borderRadius: "4px", border: "1px solid #ff2a6d", cursor: "pointer", font: "inherit",
                background: primary ? "#ff2a6d" : "transparent", color: primary ? "#0c0a12" : "#f4eef7",
            },
        }, label);
        b.replaceChildren(
            h("div", {}, `send "${text}" to ${target.label}?`),
            h("div", {},
                btn("Send", true, async () => {
                    try { await discord.send(await target.channel(), text); done(`sent. ${target.label} got it.`); }
                    catch (e: any) { done("couldn't send it: " + (e?.body?.message ?? e?.message ?? "Discord said no")); }
                }),
                btn("Cancel", false, () => done("okay, not sending it."))));
        this.placeBubble();
        this.bubbleT = setTimeout(() => { if (b.querySelector("button")) { b.replaceChildren(); b.hidden = true; } }, 30_000);
        this.talk(1200);
    },

    /** Reads out a DM or a message that pings you */
    readOut(channelId: string, m: any) {
        if (!m?.author || m.author.bot && !m.mentions?.length) return;
        const me = common.UserStore?.getCurrentUser?.()?.id;
        const ch = common.ChannelStore?.getChannel?.(channelId);
        if (!ch || !me) return;
        const isDM = ch.type === 1 || ch.type === 3;
        const pinged = !isDM && (m.mentions?.some?.((u: any) => (u?.id ?? u) === me) || m.mention_everyone);
        if (isDM ? !this.settings.readDMs : !(pinged && this.settings.readPings)) return;
        // Not for muted DMs/channels, and (if you want) not on Do Not Disturb
        if (this.settings.quietOnDnd && common.PresenceStore?.getStatus?.(me) === "dnd") return;
        const muted = this.Guilds?.isChannelMuted?.(ch.guild_id ?? null, channelId) || (ch.guild_id && this.Guilds?.isMuted?.(ch.guild_id));
        if (muted) return;
        const who = m.member?.nick || m.author.global_name || m.author.globalName || m.author.username || "someone";
        const text = speakable(m.content, {
            user: id => { const u = common.UserStore?.getUser?.(id); return u?.globalName || u?.username || "someone"; },
            channel: id => common.ChannelStore?.getChannel?.(id)?.name ?? "a channel",
            role: id => (ch.guild_id && common.GuildStore?.getRole?.(ch.guild_id, id)?.name) || "a role",
        }) || (m.attachments?.length ? "sent an attachment" : m.sticker_items?.length ? "sent a sticker" : "");
        if (!text) return;
        const line = isDM
            ? (ch.type === 3 ? `${who} in ${ch.name || "your group chat"}: ${text}` : `${who} says: ${text}`)
            : `${who} pinged you in #${ch.name}: ${text}`;
        this.wake();
        this.say(line, true);
    },

    poke() {
        this.wake();
        this.openInput();
        if (this.pose === "sit") { this.pose = "busy"; this.play("perchGlitch", () => { this.pose = "sit"; this.restSit(); }); }
        else if (this.pose === "lie") { this.pose = "busy"; this.play("lieGlitch", () => this.lieDown()); }
        else if (this.pose === "stand") { this.pose = "busy"; this.play("glitch", () => this.standIdle()); }
    },

    // ---------- lifecycle ----------
    async start() {
        this.images = new Map<string, HTMLImageElement>();
        this.dir = 1; this.pose = "gone"; this.action = "idle"; this.think = 0; this.asleep = false; this.music = false;
        this.vx = this.vy = 0; this.last = 0; this.on = null; this.lastActive = Date.now(); this.lineNo = 0;
        const cv = document.createElement("canvas"); cv.width = cv.height = 1;
        this.ctx = cv.getContext("2d", { willReadFrequently: true });

        // Load the common sets now; the big sitting and lying sets load when first needed
        for (const n of ["idle", "fall", "glitch", "arrive", "leave"] as ClipName[]) this.sheet(CLIPS[n], false);

        this.el = h("div", { class: "vanta-capri", "aria-hidden": "true" });
        Object.assign(this.el.style, {
            position: "fixed", left: "0", top: "0", zIndex: "999", pointerEvents: "none", willChange: "transform",
            backgroundRepeat: "no-repeat", transformOrigin: "0 0", filter: "drop-shadow(0 6px 8px rgba(0,0,0,.35))",
        });
        document.body.append(this.el);
        this.style = h("style", {}, `html.vanta-capri-hover, html.vanta-capri-hover * { cursor: grab !important; }
html.vanta-capri-drag, html.vanta-capri-drag * { cursor: grabbing !important; user-select: none !important; }
.vanta-capri-bubble { position: fixed; left: 0; top: 0; z-index: 1000; max-width: 260px; min-width: 40px; padding: 8px 11px;
  background: rgba(12, 10, 18, .94); color: #f4eef7; border: 1px solid var(--capri-accent, #ff2a6d); border-radius: 4px 12px 12px 12px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--capri-accent, #ff2a6d) 25%, transparent), 0 8px 24px rgba(0, 0, 0, .45), 0 0 18px color-mix(in srgb, var(--capri-accent, #ff2a6d) 18%, transparent);
  font: 13px/1.4 "Share Tech Mono", Consolas, ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; pointer-events: auto; }
.vanta-capri-bubble[hidden] { display: none; }
.vanta-capri-input { all: unset; display: block; width: 220px; color: #f4eef7; font: inherit; caret-color: #05d9e8; }
.vanta-capri-input::placeholder { color: rgba(244, 238, 247, .45); }`);
        document.head.append(this.style);
        this.bubble = h("div", { class: "vanta-capri-bubble", role: "status", hidden: true });
        document.body.append(this.bubble);
        this.history = [] as { role: "user" | "assistant"; content: string }[];
        this.applyLook();
        this.sources = []; this.playAt = 0; this.genChain = Promise.resolve();
        this.Guilds = webpack.findStore("UserGuildSettingsStore");
        this.loadPersona();
        // Load her voice model now, so her first line isn't slow
        if (this.settings.voice) setTimeout(() => { if (this.el) native.voiceWarm().catch(e => this.logger.warn("Her voice couldn't load:", e)); }, 4000);

        // Mouse: only her pixels count
        // The mouse events that follow a press on her are kept from Discord, but only for a moment: a flag that waited
        // for a click could get stuck (press on her, let go somewhere else) and then swallow every click in Discord.
        let swallowUntil = 0;
        this.onDown = (e: PointerEvent) => {
            if (e.button !== 0 || !this.hit(e.clientX, e.clientY)) { swallowUntil = 0; return; }
            e.preventDefault(); e.stopImmediatePropagation();
            swallowUntil = performance.now() + 1000;
            const start = { x: e.clientX, y: e.clientY };
            let dragging = false, ended = false;
            const trail: { x: number; y: number; t: number }[] = [];
            const move = (ev: PointerEvent) => {
                if (ev.buttons === 0) return up(); // the button was let go outside Discord
                if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
                if (!dragging) {
                    dragging = true; this.wake();
                    this.pose = "drag"; this.action = "idle"; this.setOn(null);
                    this.el.style.visibility = "";
                    document.documentElement.classList.add("vanta-capri-drag");
                    this.play("held");
                }
                this.x = ev.clientX; this.y = ev.clientY;
                trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
                if (trail.length > 6) trail.shift();
            };
            const up = () => {
                if (ended) return;
                ended = true;
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", up, true);
                window.removeEventListener("pointercancel", up, true);
                window.removeEventListener("blur", up);
                document.documentElement.classList.remove("vanta-capri-drag");
                swallowUntil = performance.now() + 300; // just the click that follows this release
                // A click pokes her, unless it turns out to be a double-click
                if (!dragging) { clearTimeout(this.pokeT); this.pokeT = setTimeout(() => this.poke(), 280); return; }
                const a = trail[0], b = trail[trail.length - 1];
                const dt = a && b && b.t > a.t ? (b.t - a.t) / 1000 : 1;
                const vx = a && b ? (b.x - a.x) / dt : 0, vy = a && b ? (b.y - a.y) / dt : 0;
                // From her hand (where she was held) down to her feet
                const k = this.k(CLIPS.held);
                this.y += (CLIPS.fall.ay - CLIPS.held.ay) * k;
                this.fallFrom(Math.max(-2500, Math.min(2500, vx)), Math.max(-2500, Math.min(2500, vy)));
            };
            window.addEventListener("pointermove", move, true);
            window.addEventListener("pointerup", up, true);
            window.addEventListener("pointercancel", up, true);
            window.addEventListener("blur", up); // switched windows mid-drag
        };
        this.onMouse = (e: MouseEvent) => {
            if (performance.now() > swallowUntil) return;
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.type === "click") swallowUntil = 0;
        };
        this.onDbl = (e: MouseEvent) => {
            if (!this.hit(e.clientX, e.clientY)) return;
            e.preventDefault(); e.stopImmediatePropagation();
            clearTimeout(this.pokeT);
            this.wake();
            if (this.pose === "stand") this.sitDown(this.ledges().sort((a, c) => Math.abs((a.left + a.right) / 2 - this.x) - Math.abs((c.left + c.right) / 2 - this.x))[0]);
            else if (this.pose === "sit") this.standUp();
            else if (this.pose === "lie") this.sitUp();
        };
        let hoverT = 0;
        this.onHover = (e: PointerEvent) => {
            const n = performance.now();
            if (n - hoverT < 50) return;
            hoverT = n;
            document.documentElement.classList.toggle("vanta-capri-hover", this.pose !== "drag" && this.hit(e.clientX, e.clientY));
            if (n - (this.movedAt || 0) > 1000) { this.movedAt = n; this.wake(); }
        };
        window.addEventListener("pointerdown", this.onDown, true);
        window.addEventListener("mousedown", this.onMouse, true);
        window.addEventListener("mouseup", this.onMouse, true);
        window.addEventListener("click", this.onMouse, true);
        window.addEventListener("dblclick", this.onDbl, true);
        window.addEventListener("pointermove", this.onHover, { passive: true, capture: true });
        this.onKey = () => this.wake();
        window.addEventListener("keydown", this.onKey, true);

        // Messages make her talk; your own can get a reaction
        const meId = () => common.UserStore?.getCurrentUser?.()?.id;
        this.offs = [
            onFlux("MESSAGE_CREATE", ({ channelId, optimistic, message }: any) => {
                if (optimistic) return;
                if (message?.author?.id === meId()) {
                    if (this.settings.ownMessages && message.content)
                        this.remark(`they just sent this message: "${String(message.content).slice(0, 300)}"`, ["ooh, bold message.", "did you really just send that?", "typing like a pro today."]);
                    return;
                }
                this.readOut(channelId, message);
                if (this.settings.talk && channelId === common.SelectedChannelStore?.getChannelId?.()) this.talk();
            }),
            onFlux("CHANNEL_SELECT", ({ channelId, guildId }: any) => setTimeout(() => {
                const ch = common.ChannelStore?.getChannel?.(channelId);
                if (!ch) return;
                const guild = guildId ? common.GuildStore?.getGuild?.(guildId)?.name : null;
                const what = ch.name ? `#${ch.name}${guild ? ` in the server ${guild}` : ""}` : "a DM with " + (common.UserStore?.getUser?.(ch.recipients?.[0])?.username ?? "someone");
                this.remark(`they just opened ${what}`, [`ooh, ${ch.name ? "#" + ch.name : "a DM"}. what are we doing here?`, "new channel, who dis?", "ooh where are we going?", "is this where the good gossip is?"]);
            }, 400)),
            onFlux("VOICE_CHANNEL_SELECT", ({ channelId }: any) => {
                if (!channelId) return;
                const name = common.ChannelStore?.getChannel?.(channelId)?.name;
                this.remark(`they just joined the voice channel ${name ?? ""}`, ["ooh, a call! can i listen in?", "who are we talking to?", "voice chat time. be nice."]);
            }),
        ];

        // Every couple of seconds: music and naps
        this.mood = setInterval(() => {
            if (document.hidden) return;
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const listening = common.PresenceStore?.getActivities?.(me)?.find?.((a: any) => a?.type === 2);
            const music = !!listening;
            const song = listening?.details ? `"${listening.details}"${listening.state ? " by " + listening.state : ""}` : null;
            if (song && song !== this.song && this.song !== undefined)
                this.remark(`a new song started: ${song}`, [`ooh, ${song}! good pick.`, "this one slaps.", "okay i'm dancing to this one."]);
            this.song = song;
            if (music !== this.music) {
                this.music = music;
                if (this.pose === "sit") this.restSit();
                if (this.pose === "lie" && music && !this.asleep) this.sitUp();
            }
            const napMs = Math.max(0.5, Number(this.settings.napAfter) || 3) * 60_000;
            if (this.settings.naps && !this.asleep && Date.now() - this.lastActive > napMs && ["stand", "sit", "lie"].includes(this.pose)) this.nap();
        }, 2000);

        // Glitch in where she was last time
        const saved = await storage.get<{ x: number; y?: number }>("Capri");
        if (!this.el) return; // stopped meanwhile
        const b = this.bounds();
        this.x = Math.max(b.left, Math.min(b.right, (saved?.x ?? 0.7) * window.innerWidth));
        this.y = Math.max(b.top, Math.min(b.bottom, (saved?.y ?? 0.6) * window.innerHeight));
        this.on = null;
        this.pose = "busy";
        this.play("arrive", () => this.standIdle());
        this.raf = requestAnimationFrame(t => this.loop(t));
    },

    stop() {
        cancelAnimationFrame(this.raf);
        clearInterval(this.mood);
        clearTimeout(this.pokeT);
        clearTimeout(this.bubbleT); clearInterval(this.typeT);
        this.offs?.forEach((f: () => void) => f());
        if ("speechSynthesis" in window) speechSynthesis.cancel();
        this.lineNo++;
        clearTimeout(this.nextT);
        for (const s of this.sources ?? []) try { s.stop(); } catch { }
        this.ac?.close().catch(() => { }); this.ac = null; this.sources = [];
        this.bubble?.remove(); this.bubble = null; this.input = null;
        window.removeEventListener("pointerdown", this.onDown, true);
        window.removeEventListener("mousedown", this.onMouse, true);
        window.removeEventListener("mouseup", this.onMouse, true);
        window.removeEventListener("click", this.onMouse, true);
        window.removeEventListener("dblclick", this.onDbl, true);
        window.removeEventListener("pointermove", this.onHover, true);
        window.removeEventListener("keydown", this.onKey, true);
        document.documentElement.classList.remove("vanta-capri-hover", "vanta-capri-drag");
        this.el?.remove(); this.el = null;
        this.style?.remove();
        this.images?.clear();
    },

    onSettingChange() { if (this.started && this.el && this.clip) { this.applySheet(); this.applyLook(); this.bus?.set(); } },

    settingsPanel() {
        const link = (text: string, url: string) => h("a", { href: url, onclick: (e: Event) => { e.preventDefault(); native.openUrl(url); } }, text);
        // Her brain: a Claude API key, stored encrypted by Vanta and never shown again
        const status = h("span", { style: { marginLeft: "8px" } }, "…");
        const keyInput = h("input", { type: "password", placeholder: "sk-ant-…", style: { width: "220px", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--background-modifier-accent)", background: "var(--input-background, var(--background-tertiary))", color: "var(--text-normal)" } }) as HTMLInputElement;
        const refresh = () => native.aiHasKey().then(has => { status.textContent = has ? "Claude key saved: she uses Claude." : "No key: she uses the free brain."; }).catch(() => { status.textContent = ""; });
        const btn = (text: string, fn: () => void) => h("button", { type: "button", onclick: fn, style: { marginLeft: "6px", padding: "6px 10px", borderRadius: "6px", border: "0", cursor: "pointer", background: "var(--brand-500, #5865f2)", color: "#fff" } }, text);
        refresh();
        const brain = h("div", { style: { margin: "0 0 10px" } },
            h("div", { style: { fontWeight: "600", color: "var(--header-primary)", marginBottom: "4px" } }, "Her brain and voice"),
            h("p", { style: { margin: "0 0 6px" } }, "With no key, she uses a free brain (", link("Pollinations", "https://pollinations.ai"),
                ") when it's free to answer, and otherwise her own offline brain on this PC (a small model, about 500 MB, downloaded the first time you chat). ",
                "What you type to her, and short notes about what you're doing (channel names, songs, and your messages if you turned that on), can go to Pollinations. ",
                "For a smarter Capri, paste an Anthropic API key (from ", link("console.anthropic.com", "https://console.anthropic.com/settings/keys"),
                "): it's encrypted on this PC, only sent to Anthropic, and billed to your account."),
            h("p", { style: { margin: "0 0 6px" } }, "Her voice is her own, from the Capri Desktop voice pack, and runs on this PC. The first time she speaks, about 90 MB downloads once (her voice and the Kokoro speech model)."),
            h("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" } },
                keyInput,
                btn("Save", () => native.aiSetKey(keyInput.value).then(() => { keyInput.value = ""; refresh(); }).catch(e => { status.textContent = String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); })),
                btn("Remove", () => native.aiSetKey(null).then(refresh)),
                status));
        return h("div", { style: { fontSize: "13px", lineHeight: "1.5", color: "var(--text-muted)" } },
            brain,
            h("p", { style: { margin: "0 0 6px" } }, "Drag her to pick her up and throw her. Click her to talk to her. Double-click her on a panel to make her sit or stand."),
            h("p", { style: { margin: "0 0 6px" } }, "Capri's art and animations are from ", link("Capri Desktop", REPO),
                " by lachydotmcg and her artists, used under PolyForm Noncommercial 1.0.0. They load from that project's GitHub."),
            h("p", { style: { margin: 0 } }, "Capri is an unofficial fan project, not approved or endorsed by CD PROJEKT RED. For the full version (voice, calls, games), get ",
                link("Capri Desktop", REPO), "."));
    },
});
