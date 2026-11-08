/** The Vanta pixel logo as a list of coloured cells, from assets/logo.json. */
import logo from "../../assets/logo.json";

export interface LogoCell { x: number; y: number; color: string }

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

export const LOGO_WIDTH = Math.max(...logo.rows.map(r => r.length));
export const LOGO_HEIGHT = logo.rows.length;

export function logoCells(): LogoCell[] {
    const cells: LogoCell[] = [];
    const { from, to, char } = logo.gradient;
    const a = hex(from), b = hex(to);
    const span = LOGO_WIDTH + LOGO_HEIGHT - 2;
    logo.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === ".") return;
        let color = (logo.colors as Record<string, string>)[ch];
        if (ch === char) {
            const t = (x + y) / span; // diagonal gradient, top-left → bottom-right
            color = toHex(a.map((v, i) => v + (b[i] - v) * t));
        }
        if (color) cells.push({ x, y, color });
    }));
    return cells;
}
