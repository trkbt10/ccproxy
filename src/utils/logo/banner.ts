const COLORS = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
} as const;

export type BannerColor = keyof Omit<typeof COLORS, "reset"> | "random";

export type BannerOptions = {
  color?: BannerColor; // fallback/global color
  colorRanges?: Array<{ start: number; end: number; color: BannerColor }>; // inclusive indices
  spacing?: number; // default 1
};

// 3-column compact glyphs (height 3). 1=filled, 0=space
const RAW_BITMAPS: Record<string, string[]> = {
  // Space
  " ": ["0", "0", "0"],
  // Uppercase A-Z
  A: ["010", "111", "101"],
  B: ["110", "111", "110"],
  C: ["011", "100", "011"],
  D: ["110", "101", "110"],
  E: ["111", "110", "111"],
  F: ["111", "110", "100"],
  G: ["011", "101", "111"],
  H: ["101", "111", "101"],
  I: ["111", "010", "111"],
  J: ["011", "001", "111"],
  K: ["101", "110", "101"],
  L: ["100", "100", "111"],
  M: ["1001", "1101", "1001"], // wide M
  N: ["101", "111", "101"],
  O: ["111", "101", "111"],
  P: ["1110", "1001", "1000"], // wide P
  Q: ["111", "101", "110"],
  R: ["1110", "1001", "1010"], // wide R
  S: ["011", "010", "110"],
  T: ["111", "010", "010"],
  U: ["101", "101", "111"],
  V: ["101", "101", "010"],
  W: ["1001", "1001", "0110"], // wide W
  X: ["101", "010", "101"],
  Y: ["101", "010", "010"],
  Z: ["111", "010", "111"],
  // Lowercase a-z
  a: ["011", "101", "111"],
  b: ["100", "110", "111"],
  c: ["011", "100", "011"],
  d: ["001", "011", "111"],
  e: ["011", "111", "011"],
  f: ["011", "110", "100"],
  g: ["011", "101", "111"],
  h: ["100", "110", "101"],
  i: ["010", "000", "010"],
  j: ["001", "001", "110"],
  k: ["100", "110", "101"],
  l: ["100", "100", "100"],
  m: ["000", "111", "101"], // simplified
  n: ["110", "101", "101"],
  o: ["011", "101", "011"],
  p: ["110", "101", "110"],
  q: ["011", "101", "011"],
  r: ["110", "100", "100"],
  s: ["011", "010", "110"],
  t: ["111", "010", "010"],
  u: ["101", "101", "111"],
  v: ["101", "101", "010"],
  w: ["1001", "1001", "0110"],
  x: ["101", "010", "101"],
  y: ["101", "010", "010"],
  z: ["111", "010", "111"],
};

const FILL_CHAR = "█";

function buildFont(
  bitmaps: Record<string, string[]>
): Record<string, string[]> {
  const font: Record<string, string[]> = {};
  for (const [ch, rows] of Object.entries(bitmaps)) {
    const width = Math.max(...rows.map((r) => r.length));
    font[ch] = rows.map((row) =>
      row.padEnd(width, "0").replace(/0/g, " ").replace(/1/g, FILL_CHAR)
    );
  }
  return font;
}

const FONT = buildFont(RAW_BITMAPS);
const DEFAULT_WIDTH = 3; // generic fallback width
function renderTextSmall(text: string, spacing = 1): string[] {
  const lines = Array.from({ length: 3 }, () => [] as string[]);
  for (const raw of text.split("")) {
    const glyph = FONT[raw] || [
      " ".repeat(DEFAULT_WIDTH),
      " ".repeat(DEFAULT_WIDTH),
      " ".repeat(DEFAULT_WIDTH),
    ];
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
  const termWidth =
    typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const maxWidth = termWidth - 1;
  // Calculate visible width by removing ANSI escape codes
  const visibleWidth = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '').length;
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

// Deprecated: retain stub exports (optional). Removed actual implementations.
