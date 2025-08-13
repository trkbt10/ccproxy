const COLORS = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
} as const;

export type BannerColor = keyof Omit<typeof COLORS, "reset"> | "random";

export type BannerOptions = {
  color?: BannerColor; // fallback/global color
  colorRanges?: Array<{ start: number; end: number; color: BannerColor }>; // inclusive indices
  spacing?: number; // default 1
};

import { FONT_3x3 } from "./fonts";

const FILL_CHAR = "█";

function buildFont(bitmaps: Record<string, string[]>): Record<string, string[]> {
  const font: Record<string, string[]> = {};
  for (const [ch, rows] of Object.entries(bitmaps)) {
    const width = Math.max(...rows.map((r) => r.length));
    font[ch] = rows.map((row) => row.padEnd(width, "0").replace(/0/g, " ").replace(/1/g, FILL_CHAR));
  }
  return font;
}

const FONT = buildFont(FONT_3x3);
const DEFAULT_WIDTH = 3; // generic fallback width
function renderTextSmall(text: string, spacing = 1): string[] {
  const lines = Array.from({ length: 3 }, () => [] as string[]);
  for (const raw of text.split("")) {
    const glyph = FONT[raw] || [" ".repeat(DEFAULT_WIDTH), " ".repeat(DEFAULT_WIDTH), " ".repeat(DEFAULT_WIDTH)];
    for (let i = 0; i < 3; i++) {
      lines[i].push(glyph[i]);
      if (spacing > 0) lines[i].push(" ".repeat(spacing));
    }
  }
  return lines.map((row) => row.join(""));
}

function pickColor(color?: BannerColor): keyof typeof COLORS {
  if (!color || color === "random") {
    const shades: BannerColor[] = ["cyan", "green", "magenta", "yellow"];
    const idx = Math.floor(Math.random() * shades.length);
    return shades[idx] as keyof typeof COLORS;
  }
  return color as keyof typeof COLORS;
}

export function getBanner(text: string, options?: BannerOptions): string {
  const spacing = options?.spacing ?? 1;
  const baseColor = pickColor(options?.color);
  // Pre-render glyphs per character to allow per-char coloring
  const chars = text.split("");
  const glyphs = chars.map((ch) => renderTextSmall(ch, 0)); // each returns 3 lines
  // Build mapping from char index to color
  const ranges = options?.colorRanges || [];
  const pickPerIndex = (idx: number): keyof typeof COLORS => {
    const found = ranges.find((r) => idx >= r.start && idx <= r.end);
    return found ? pickColor(found.color) : baseColor;
  };
  // Assemble lines
  const lines: string[] = ["", "", ""];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const c = pickPerIndex(i);
    for (let row = 0; row < 3; row++) {
      lines[row] += colorizeSegment(g[row], c);
    }
    if (spacing > 0 && i < glyphs.length - 1) {
      for (let row = 0; row < 3; row++) lines[row] += " ".repeat(spacing);
    }
  }
  // Width fallback logic
  const termWidth = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const maxWidth = termWidth - 1;
  // Calculate visible width by removing ANSI escape codes
  const visibleWidth = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "").length;
  const width = Math.max(...lines.map(visibleWidth));
  if (width > maxWidth) {
    // retry with no spacing
    if (spacing > 0) return getBanner(text, { ...options, spacing: 0 });
    if (width > maxWidth) return `${COLORS[baseColor]}${text}${COLORS.reset}`;
  }
  return lines.join("\n");
}

// helper to colorize a single glyph line already trimmed
function colorizeSegment(segment: string, color: keyof typeof COLORS): string {
  let out = "";
  for (const ch of segment) {
    out += ch !== " " ? `${COLORS[color]}${ch}${COLORS.reset}` : ch;
  }
  return out;
}
