import { FONT_3x5, GLYPH_WIDTH_3x5, GLYPH_HEIGHT_3x5 } from "./fonts";

const GLYPH_WIDTH = GLYPH_WIDTH_3x5;
const GLYPH_HEIGHT = GLYPH_HEIGHT_3x5;

function composeBitmap(text: string, letterSpacing = 1): boolean[][] {
  const chars = Array.from(text.toUpperCase());
  const totalWidth = chars.reduce((sum, ch) => sum + (ch === " " ? 1 : GLYPH_WIDTH) + letterSpacing, -letterSpacing);

  const h = GLYPH_HEIGHT;
  const w = Math.max(0, totalWidth);
  const canvas: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));

  let x = 0;
  for (const ch of chars) {
    const pattern = FONT_3x5[ch] ?? FONT_3x5[" "];
    const gw = ch === " " ? 1 : GLYPH_WIDTH;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < gw; col++) {
        const idx = row * GLYPH_WIDTH + col;
        if (pattern[idx] === "1") {
          canvas[row][x + col] = true;
        }
      }
    }
    x += gw + letterSpacing;
  }
  return canvas;
}

function brailleFromCell(get: (r: number, c: number) => boolean, r0: number, c0: number): string {
  const bit = (n: number) => 1 << (n - 1);
  let code = 0;
  if (get(r0 + 0, c0 + 0)) code |= bit(1);
  if (get(r0 + 1, c0 + 0)) code |= bit(2);
  if (get(r0 + 2, c0 + 0)) code |= bit(3);
  if (get(r0 + 3, c0 + 0)) code |= bit(7);
  if (get(r0 + 0, c0 + 1)) code |= bit(4);
  if (get(r0 + 1, c0 + 1)) code |= bit(5);
  if (get(r0 + 2, c0 + 1)) code |= bit(6);
  if (get(r0 + 3, c0 + 1)) code |= bit(8);
  return String.fromCharCode(0x2800 + code);
}

function bitmapToBraille(canvas: boolean[][]): string {
  const H = canvas.length;
  const W = canvas[0]?.length ?? 0;
  const get = (r: number, c: number) => (r >= 0 && c >= 0 && r < H && c < W ? canvas[r][c] : false);
  const lines: string[] = [];
  for (let r = 0; r < H; r += 4) {
    let line = "";
    for (let c = 0; c < W; c += 2) {
      line += brailleFromCell(get, r, c);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

export function renderTinyBraille(text: string, letterSpacing = 1): string {
  return bitmapToBraille(composeBitmap(text, letterSpacing));
}
