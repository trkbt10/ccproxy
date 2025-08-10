const COLORS = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
} as const;

export type BannerColor = keyof Omit<typeof COLORS, "reset"> | "random";

export type BannerOptions = {
  color?: BannerColor;
};

// 3-column compact glyphs (height 3). 1=filled, 0=space
const RAW_BITMAPS: Record<string, string[]> = {
  " ": ["0", "0", "0"],
  C: ["011", "100", "011"],
  // 4-column wider P
  P: ["1110", "1001", "1000"],
  // 4-column wider R (with diagonal leg)
  R: ["1110", "1001", "1010"],
  O: ["111", "101", "111"],
  X: ["101", "010", "101"],
  Y: ["101", "010", "010"], // compact Y (single stem)
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
const DEFAULT_WIDTH = Math.max(...FONT.C.map((l) => l.length));

function renderTextSmall(text: string, spacing = 1): string[] {
  const lines = Array.from({ length: 3 }, () => [] as string[]);
  for (const raw of text.toUpperCase().split("")) {
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
  return lines.map((row) => row.join("").replace(/\s+$/g, ""));
}

function pickColor(color?: BannerColor): keyof typeof COLORS {
  if (!color || color === "random") {
    const shades: BannerColor[] = ["cyan", "green", "magenta", "yellow"];
    const idx = Math.floor(Math.random() * shades.length);
    return shades[idx] as keyof typeof COLORS;
  }
  return color as keyof typeof COLORS;
}

export function getCcproxyBanner(options?: BannerOptions): string {
  const color = pickColor(options?.color);
  let lines = renderTextSmall("CCPROXY", 1);
  const termWidth =
    typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const maxWidth = termWidth - 1;
  const computeWidth = (ls: string[]) =>
    Math.max(0, ...ls.map((l) => l.length));
  let width = computeWidth(lines);
  if (width > maxWidth) {
    lines = renderTextSmall("CCPROXY", 0);
    width = computeWidth(lines);
  }
  if (width > maxWidth) {
    return `${COLORS[color]}CCPROXY${COLORS.reset}`;
  }
  return colorize(lines, color).join("\n");
}

export function printCcproxyBanner(options?: BannerOptions): void {
  const banner = getCcproxyBanner({ ...options });
  // eslint-disable-next-line no-console
  console.log("\n" + banner + "\n");
}

export function getBanner(text: string, options?: BannerOptions): string {
  const color = pickColor(options?.color);
  let lines = renderTextSmall(text, 1);
  const termWidth =
    typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const maxWidth = termWidth - 1;
  const computeWidth = (ls: string[]) =>
    Math.max(0, ...ls.map((l) => l.length));
  let width = computeWidth(lines);
  if (width > maxWidth) {
    lines = renderTextSmall(text, 0);
    width = computeWidth(lines);
  }
  if (width > maxWidth) {
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }
  return colorize(lines, color).join("\n");
}

function colorize(lines: string[], color: keyof typeof COLORS): string[] {
  return lines.map((line) =>
    line
      .split("")
      .map((ch) => (ch !== " " ? `${COLORS[color]}${ch}${COLORS.reset}` : ch))
      .join("")
  );
}
