/**
 * The Vanta pixel logo, from assets/logo.json: vanta-black letters with a thin glowing rim along
 * every outside edge (lavender top-left → violet bottom-right), plus the void orb and a sparkle.
 * scripts/make-logo.mjs uses the same rules for the PNG/ICO files.
 */
import logo from "../../assets/logo.json";

export interface LogoCell { x: number; y: number; color: string }
export interface LogoRect { x: number; y: number; w: number; h: number }

export const LOGO_WIDTH = Math.max(...logo.rows.map(r => r.length));
export const LOGO_HEIGHT = logo.rows.length;
export const LOGO_RIM = logo.rim;

const filled = (x: number, y: number) => { const c = logo.rows[y]?.[x]; return !!c && c !== "."; };

export function logoCells(): LogoCell[] {
    const cells: LogoCell[] = [];
    logo.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        const color = (logo.colors as Record<string, string>)[ch];
        if (ch !== "." && color) cells.push({ x, y, color });
    }));
    return cells;
}

/** Thin rectangles (in cell units) along the outer edges of the rimmed letters. */
export function logoRim(): LogoRect[] {
    const t = logo.rim.width;
    const out: LogoRect[] = [];
    logo.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== logo.rim.char) return;
        if (!filled(x, y - 1)) out.push({ x, y, w: 1, h: t });
        if (!filled(x, y + 1)) out.push({ x, y: y + 1 - t, w: 1, h: t });
        if (!filled(x - 1, y)) out.push({ x, y, w: t, h: 1 });
        if (!filled(x + 1, y)) out.push({ x: x + 1 - t, y, w: t, h: 1 });
        // inside (concave) corners: both sides filled but the diagonal is empty
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            if (filled(x + dx, y) && filled(x, y + dy) && !filled(x + dx, y + dy))
                out.push({ x: dx < 0 ? x : x + 1 - t, y: dy < 0 ? y : y + 1 - t, w: t, h: t });
        }
    }));
    return out;
}
