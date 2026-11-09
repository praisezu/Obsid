/*
 * Capri: a desktop mate that lives inside Discord's window (and only there).
 * Her art and animations are the Capri Desktop project's sprite sheets by lachydotmcg and her artists
 * (https://github.com/lachydotmcg/capri-desktop), used under PolyForm Noncommercial 1.0.0 with credit.
 * They load from that repo at runtime and aren't bundled with Vanta.
 *
 * She walks along the bottom of the window and along the tops of Discord's panels, glitches from one to
 * another, sits on edges with her legs hanging, lies down, dances to your music, naps, and can be picked
 * up and thrown. Only her actual pixels catch the mouse, so she never blocks clicks around her.
 */
import { definePlugin, common, webpack, onFlux, storage, native, h } from "@api";

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
    walk: st("walk", 12, 15),
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

/** Tops of Discord's panels she can stand, walk and sit on */
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
/** How far (in walk-sheet pixels) one full walk cycle carries her: two steps of ~33 px, measured from the sheet */
const WALK_STRIDE = 66;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(weighted: [T, number][]): T => {
    let r = Math.random() * weighted.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of weighted) if ((r -= w) <= 0) return v;
    return weighted[weighted.length - 1][0];
};

export default definePlugin({
    name: "Capri",
    description: "Capri, the desktop mate, lives in your Discord window: she walks along the panels, sits on edges, lies down, dances to your music and naps. Pick her up and throw her. Art from the Capri Desktop project.",
    authors: ["Vanta"], category: "Appearance", since: "0.5.3",
    needsWebpack: true,
    options: {
        size: { type: "number", default: 0.5, label: "Size", description: "0.3 to 1" },
        wander: { type: "boolean", default: true, label: "Wander around on her own" },
        talk: { type: "boolean", default: true, label: "Talk when messages arrive" },
        naps: { type: "boolean", default: true, label: "Nap when you're away" },
        napAfter: { type: "number", default: 3, label: "Nap after (minutes)" },
        voice: { type: "boolean", default: true, label: "Speak out loud", description: "In her own voice, from the Capri Desktop voice pack." },
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
        const left = this.x - (mirror ? c.w * k - ax : ax), top = this.y - c.ay * k;
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
        storage.set("Capri", { x: this.x / window.innerWidth, ledge: this.on?.el ? LEDGES.findIndex(s => this.on.el.matches(s)) : -1 }, 3000);
    },

    standIdle() { this.pose = "stand"; this.action = "idle"; this.play("idle"); this.think = performance.now() + rand(3000, 8000); },

    sitDown() {
        this.pose = "busy";
        this.play("perchArrive", () => { this.pose = "sit"; this.satAt = performance.now(); this.restSit(); });
    },
    restSit() {
        this.play(this.music ? "perchMusic" : "perch");
        this.think = performance.now() + rand(15000, 40000);
    },
    standUp() {
        this.pose = "busy";
        this.play("perchLeave", () => this.standIdle());
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
    teleport(to: Ledge) {
        this.pose = "busy";
        this.play("leave", () => {
            this.pose = "gone";
            this.el.style.visibility = "hidden";
            setTimeout(() => {
                if (!this.el) return;
                this.x = rand(to.left + 30, to.right - 30);
                this.y = to.top;
                this.setOn(to);
                this.el.style.visibility = "";
                this.pose = "busy";
                this.play("arrive", () => this.standIdle());
            }, rand(250, 700));
        });
    },

    walkTo(x: number) {
        this.pose = "stand"; this.action = "walk"; this.target = x;
        this.dir = x < this.x ? -1 : 1;
        this.play("walk");
    },

    fallFrom(vx = 0, vy = 0) {
        this.pose = "air"; this.vx = vx; this.vy = vy; this.setOn(null);
        if (Math.abs(vx) > 60) this.dir = vx < 0 ? -1 : 1;
        this.play("fall");
    },

    /** Picks something to do. Runs when the current activity's time is up. */
    decide() {
        const now = performance.now();
        if (!this.settings.wander && this.pose !== "lie") { this.think = now + 10000; return; }
        const g = this.ground();
        if (this.pose === "stand") {
            const onLedge = !!g?.el;
            const others = this.ledges().filter(l => l.el !== g?.el);
            const choice = pick<string>([
                ["walk", 55], ["idle", 20], ["grin", 6],
                ["dance", this.music ? 35 : 0],
                ["sit", onLedge ? 35 : 0],
                ["hop", others.length ? (onLedge ? 8 : 12) : 0],
                ["floor", onLedge ? 6 : 0],
            ]);
            if (choice === "walk" && g) {
                const span = Math.max(80, this.S() * 2.5);
                const lo = Math.max(g.left + 25, this.x - span), hi = Math.min(g.right - 25, this.x + span);
                if (hi - lo > 40) return this.walkTo(rand(lo, hi));
            }
            if (choice === "sit") return this.sitDown();
            if (choice === "hop" && others.length) return this.teleport(others[Math.floor(Math.random() * others.length)]);
            if (choice === "floor") return this.teleport(this.floor());
            if (choice === "dance") { this.play("dance"); this.think = now + rand(8000, 20000); return; }
            if (choice === "grin") { this.play("grin", () => this.standIdle()); this.think = Infinity; return; }
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

        if (this.pose === "air") {
            const prevY = this.y;
            this.vy += GRAVITY * dt;
            this.x += this.vx * dt; this.y += this.vy * dt;
            const half = 40;
            if (this.x < half || this.x > window.innerWidth - half) { this.vx *= -0.5; this.x = Math.max(half, Math.min(window.innerWidth - half, this.x)); }
            if (this.y < 60) { this.y = 60; this.vy = Math.abs(this.vy) * 0.3; }
            const land = this.vy > 0 ? this.landing(this.x, prevY, this.y) : null;
            if (land) {
                if (this.vy > 1100 && !land.el) { this.y = land.top; this.vy *= -0.3; this.vx *= 0.7; }
                else { this.y = land.top; this.vx = this.vy = 0; this.setOn(land); this.pose = "busy"; this.play("glitch", () => this.standIdle()); }
            }
        } else if (this.pose !== "drag" && this.pose !== "gone") {
            const g = this.ground();
            if (!g) { this.fallFrom(); }
            else {
                this.y = g.top;
                if (this.action === "walk" && this.pose === "stand") {
                    // Matched to her stride: her feet land WALK_STRIDE sheet pixels further on each walk cycle
                    const w = CLIPS.walk, speed = WALK_STRIDE * this.k(w) * w.fps / w.n;
                    const step = Math.sign(this.target - this.x) * speed * dt;
                    if (Math.abs(this.target - this.x) <= Math.abs(step)) { this.x = this.target; this.save(); this.standIdle(); }
                    else this.x += step;
                }
                // Walked or got pushed off the end of a panel: drop
                if (g.el && (this.x < g.left + 4 || this.x > g.right - 4)) {
                    if (this.pose === "stand") this.fallFrom(this.dir * 120, 0);
                    else this.x = Math.max(g.left + 12, Math.min(g.right - 12, this.x));
                }
                // (not mid-walk: the walk ends itself when she gets there)
                if (this.pose !== "busy" && this.pose !== "air" && this.action !== "walk" && now >= this.think) this.decide();
            }
        }
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
                const gain = this.ac.createGain();
                gain.gain.value = VOICE.volume;
                src.connect(gain).connect(this.ac.destination);
                const start = Math.max(this.ac.currentTime + 0.02, this.playAt || 0);
                src.start(start);
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
            `You walk along Discord's panels, sit on the message box, nap and dance to their music. You only know the notes you're given about what's happening in Discord; never guess the rest.`;
        if (this.desktopPersona) return this.desktopPersona + here;
        return `You are Capri, a glitchy personality construct from Night City. A playful chaos gremlin: sarcastic, teasing, a little smug, never mean, openly fond of ${name}. ` +
            `Talk like a friend texting, never like an assistant. One short line under 25 words, plain text, no emoji or asterisks. Use Night City slang like choom only now and then.` + here;
    },

    /** Gets her reply from Claude (or a canned one without a key) and says it */
    async reply(userText: string) {
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
                "\nThey're talking to you directly now. Always answer exactly what they just said or asked, straight away, in character.", this.history, 150);
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
        for (const n of ["idle", "walk", "fall", "glitch", "arrive", "leave"] as ClipName[]) this.sheet(CLIPS[n], false);

        this.el = h("div", { class: "vanta-capri", "aria-hidden": "true" });
        Object.assign(this.el.style, {
            position: "fixed", left: "0", top: "0", zIndex: "999", pointerEvents: "none", willChange: "transform",
            backgroundRepeat: "no-repeat", transformOrigin: "0 0", filter: "drop-shadow(0 6px 8px rgba(0,0,0,.35))",
        });
        document.body.append(this.el);
        this.style = h("style", {}, `html.vanta-capri-hover, html.vanta-capri-hover * { cursor: grab !important; }
html.vanta-capri-drag, html.vanta-capri-drag * { cursor: grabbing !important; user-select: none !important; }
.vanta-capri-bubble { position: fixed; left: 0; top: 0; z-index: 1000; max-width: 260px; min-width: 40px; padding: 8px 11px;
  background: rgba(12, 10, 18, .94); color: #f4eef7; border: 1px solid #ff2a6d; border-radius: 4px 12px 12px 12px;
  box-shadow: 0 0 0 1px rgba(255, 42, 109, .25), 0 8px 24px rgba(0, 0, 0, .45), 0 0 18px rgba(255, 42, 109, .18);
  font: 13px/1.4 "Share Tech Mono", Consolas, ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; pointer-events: auto; }
.vanta-capri-bubble[hidden] { display: none; }
.vanta-capri-input { all: unset; display: block; width: 220px; color: #f4eef7; font: inherit; caret-color: #05d9e8; }
.vanta-capri-input::placeholder { color: rgba(244, 238, 247, .45); }`);
        document.head.append(this.style);
        this.bubble = h("div", { class: "vanta-capri-bubble", role: "status", hidden: true });
        document.body.append(this.bubble);
        this.history = [] as { role: "user" | "assistant"; content: string }[];
        this.sources = []; this.playAt = 0; this.genChain = Promise.resolve();
        this.Guilds = webpack.findStore("UserGuildSettingsStore");
        this.loadPersona();
        // Load her voice model now, so her first line isn't slow
        if (this.settings.voice) setTimeout(() => { if (this.el) native.voiceWarm().catch(e => this.logger.warn("Her voice couldn't load:", e)); }, 4000);

        // Mouse: only her pixels count
        let swallowClick = false;
        this.onDown = (e: PointerEvent) => {
            if (e.button !== 0 || !this.hit(e.clientX, e.clientY)) return;
            e.preventDefault(); e.stopImmediatePropagation();
            swallowClick = true;
            const start = { x: e.clientX, y: e.clientY };
            let dragging = false;
            const trail: { x: number; y: number; t: number }[] = [];
            const move = (ev: PointerEvent) => {
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
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", up, true);
                window.removeEventListener("pointercancel", up, true);
                document.documentElement.classList.remove("vanta-capri-drag");
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
        };
        this.onMouse = (e: MouseEvent) => { if (swallowClick) { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === "click") swallowClick = false; } };
        this.onDbl = (e: MouseEvent) => {
            if (!this.hit(e.clientX, e.clientY)) return;
            e.preventDefault(); e.stopImmediatePropagation();
            clearTimeout(this.pokeT);
            this.wake();
            if (this.pose === "stand" && this.ground()?.el) this.sitDown();
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
        const saved = await storage.get<{ x: number; ledge: number }>("Capri");
        if (!this.el) return; // stopped meanwhile
        const ledge = saved && saved.ledge >= 0 ? this.ledges().find(l => l.el?.matches(LEDGES[saved.ledge])) : null;
        const on = ledge ?? this.floor();
        this.x = Math.max(on.left + 30, Math.min(on.right - 30, (saved?.x ?? 0.7) * window.innerWidth));
        this.y = on.top; this.on = on;
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

    onSettingChange() { if (this.started && this.el && this.clip) this.applySheet(); },

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
