// Renders assets/logo.json into PNG/ICO files:
//   assets/logo.png        512px, for the README
//   installer/logo.png     256px, embedded in the installer window
//   installer/vanta.ico    multi-size icon for VantaInstaller.exe (run `go generate` in installer/ after)
// Same look as src/shared/logo.ts: vanta-black letters with a glowing rim, the void orb, a sparkle.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logo = JSON.parse(readFileSync(join(root, "assets/logo.json"), "utf8"));

const W = Math.max(...logo.rows.map(r => r.length)), H = logo.rows.length;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const ch = (x, y) => logo.rows[y]?.[x] ?? ".";
const filled = (x, y) => ch(x, y) !== ".";
const color = (x, y) => logo.colors[ch(x, y)] ? hex(logo.colors[ch(x, y)]) : null;
const RIM_FROM = hex(logo.rim.from), RIM_TO = hex(logo.rim.to);
const OUTLINE = hex("#1a1523");
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Is the point (fx, fy) (in cell units, inside rimmed cell x,y) within the rim? */
function onRim(x, y, fx, fy, t) {
    const lx = fx - x, ly = fy - y;
    if (!filled(x, y - 1) && ly < t) return true;
    if (!filled(x, y + 1) && ly > 1 - t) return true;
    if (!filled(x - 1, y) && lx < t) return true;
    if (!filled(x + 1, y) && lx > 1 - t) return true;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (filled(x + dx, y) && filled(x, y + dy) && !filled(x + dx, y + dy)) {
            const inX = dx < 0 ? lx < t : lx > 1 - t, inY = dy < 0 ? ly < t : ly > 1 - t;
            if (inX && inY) return true;
        }
    }
    return false;
}

/** Hairline dark outline just outside the shapes, so light parts show on light backgrounds. */
function nearShape(fx, fy, t) {
    const gx = Math.floor(fx), gy = Math.floor(fy);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx, cy = gy + dy;
        if (!filled(cx, cy)) continue;
        const ddx = Math.max(cx - fx, 0, fx - (cx + 1)), ddy = Math.max(cy - fy, 0, fy - (cy + 1));
        if (Math.hypot(ddx, ddy) <= t) return true;
    }
    return false;
}

/** Square transparent RGBA image, logo centred. */
function render(size) {
    const side = Math.max(W, H) + 1;
    const cell = size / side;
    const ox = (side - W) / 2, oy = (side - H) / 2;
    const rimT = Math.max(logo.rim.width, 1.2 / cell); // never thinner than ~1 pixel
    const outlineT = Math.max(1 / cell, 0.18);
    const px = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const fx = (x + 0.5) / cell - ox, fy = (y + 0.5) / cell - oy;
        const gx = Math.floor(fx), gy = Math.floor(fy);
        let c = null;
        if (filled(gx, gy)) {
            c = color(gx, gy);
            if (ch(gx, gy) === logo.rim.char && onRim(gx, gy, fx, fy, rimT)) c = mix(RIM_FROM, RIM_TO, Math.min(1, Math.max(0, (fx + fy) / (W + H))));
        } else if (nearShape(fx, fy, outlineT)) c = OUTLINE;
        if (!c) continue;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    return px;
}

function png(size) {
    const raw = render(size);
    const rows = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) raw.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function ico(sizes) {
    const images = sizes.map(png);
    const head = Buffer.alloc(6 + 16 * sizes.length);
    head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    let offset = head.length;
    sizes.forEach((s, i) => {
        const o = 6 + 16 * i;
        head[o] = s >= 256 ? 0 : s; head[o + 1] = s >= 256 ? 0 : s;
        head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
        head.writeUInt32LE(images[i].length, o + 8); head.writeUInt32LE(offset, o + 12);
        offset += images[i].length;
    });
    return Buffer.concat([head, ...images]);
}

writeFileSync(join(root, "assets/logo.png"), png(512));
writeFileSync(join(root, "installer/logo.png"), png(256));
writeFileSync(join(root, "installer/vanta.ico"), ico([16, 24, 32, 48, 64, 128, 256]));
console.log("Wrote assets/logo.png, installer/logo.png, installer/vanta.ico");
