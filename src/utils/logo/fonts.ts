/**
 * Shared font definitions for banner and braille rendering
 */

export const GLYPH_WIDTH_3x5 = 3;
export const GLYPH_HEIGHT_3x5 = 5;

export const GLYPH_WIDTH_3x3 = 3;
export const GLYPH_HEIGHT_3x3 = 3;

/**
 * 3x5 font for tiny braille rendering
 * Each character is represented as a 15-character string of "0" and "1"
 * Read left-to-right, top-to-bottom
 */
export const FONT_3x5: Record<string, string> = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101110100110101",
  L: "100100100100111",
  M: "101111111101101",
  N: "101110111101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101011001",
  R: "110101110110101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",

  "0": "010101101101010",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100110101011",
  "7": "111001010010010",
  "8": "011101010101011",
  "9": "011101011001110",

  "-": "000000111000000",
  " ": "000000000000000",
};

/**
 * 3x3 font for banner rendering
 * Each row is a string where "1" = filled, "0" = space
 * Some characters (M, P, R, W) are wider
 */
export const FONT_3x3: Record<string, string[]> = {
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
  m: ["000", "111", "101"],
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

/**
 * Convert a 3x5 font pattern to a boolean bitmap
 */
export function font3x5ToBitmap(pattern: string, width = 3, height = 5): boolean[][] {
  const bitmap: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      if (pattern[idx] === "1") {
        bitmap[row][col] = true;
      }
    }
  }
  return bitmap;
}

/**
 * Convert 3x3 font rows to a flat string pattern (for compatibility)
 */
export function font3x3ToPattern(rows: string[]): string {
  const width = Math.max(...rows.map(r => r.length));
  const height = rows.length;
  let pattern = "";
  for (let row = 0; row < height; row++) {
    const rowStr = rows[row].padEnd(width, "0");
    pattern += rowStr;
  }
  return pattern;
}