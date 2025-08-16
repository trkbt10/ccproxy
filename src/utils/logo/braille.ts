/**
 * High-Resolution Terminal Font Renderer using Complex Block Characters (TypeScript)
 *
 * This version uses an 8-dot-per-cell approach with characters like ���� to create higher
 * resolution than half-blocks. Each terminal cell encodes a 2�4 pixel block.
 * The font data is stored as a high-res bitmap and then mapped into Unicode block
 * characters (U+2580..U+259F plus quadrants U+2596..U+259F).
 */

type HRGlyph = string[]; // rows of '#' and ' ' for high-res pixels

// 8�8 bitmap font
const FONT_HR: Record<string, HRGlyph> = {
  'A': [
    '  ####  ',
    ' ##  ## ',
    '##    ##',
    '##    ##',
    '########',
    '##    ##',
    '##    ##',
    '##    ##',
  ],
  'B': [
    '######  ',
    '##   ## ',
    '##   ## ',
    '######  ',
    '######  ',
    '##   ## ',
    '##   ## ',
    '######  ',
  ],
  'C': [
    ' ###### ',
    '##    ##',
    '##      ',
    '##      ',
    '##      ',
    '##      ',
    '##    ##',
    ' ###### ',
  ],
  'D': [
    '######  ',
    '##   ## ',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##   ## ',
    '######  ',
  ],
  'E': [
    '########',
    '##      ',
    '##      ',
    '######  ',
    '######  ',
    '##      ',
    '##      ',
    '########',
  ],
  'F': [
    '########',
    '##      ',
    '##      ',
    '######  ',
    '######  ',
    '##      ',
    '##      ',
    '##      ',
  ],
  'G': [
    ' ###### ',
    '##    ##',
    '##      ',
    '##  ####',
    '##  ####',
    '##    ##',
    '##    ##',
    ' ###### ',
  ],
  'H': [
    '##    ##',
    '##    ##',
    '##    ##',
    '########',
    '########',
    '##    ##',
    '##    ##',
    '##    ##',
  ],
  'I': [
    '########',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '########',
  ],
  'J': [
    '########',
    '     ## ',
    '     ## ',
    '     ## ',
    '     ## ',
    '##   ## ',
    '##   ## ',
    ' ###### ',
  ],
  'K': [
    '##   ## ',
    '##  ##  ',
    '## ##   ',
    '####    ',
    '####    ',
    '## ##   ',
    '##  ##  ',
    '##   ## ',
  ],
  'L': [
    '##      ',
    '##      ',
    '##      ',
    '##      ',
    '##      ',
    '##      ',
    '##      ',
    '########',
  ],
  'M': [
    '##    ##',
    '###  ###',
    '########',
    '## ## ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
  ],
  'N': [
    '##    ##',
    '###   ##',
    '####  ##',
    '## ## ##',
    '##  ####',
    '##   ###',
    '##    ##',
    '##    ##',
  ],
  'O': [
    ' ###### ',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    ' ###### ',
  ],
  'P': [
    '######  ',
    '##   ## ',
    '##   ## ',
    '######  ',
    '##      ',
    '##      ',
    '##      ',
    '##      ',
  ],
  'Q': [
    ' ###### ',
    '##    ##',
    '##    ##',
    '##    ##',
    '## ## ##',
    '##  ####',
    ' ###### ',
    '     ## ',
  ],
  'R': [
    '######  ',
    '##   ## ',
    '##   ## ',
    '######  ',
    '## ##   ',
    '##  ##  ',
    '##   ## ',
    '##    ##',
  ],
  'S': [
    ' ###### ',
    '##    ##',
    '##      ',
    ' #####  ',
    '     ## ',
    '      ##',
    '##    ##',
    ' ###### ',
  ],
  'T': [
    '########',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
  ],
  'U': [
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    ' ###### ',
  ],
  'V': [
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    ' ##  ## ',
    '  ####  ',
    '   ##   ',
  ],
  'W': [
    '##    ##',
    '##    ##',
    '##    ##',
    '##    ##',
    '## ## ##',
    '########',
    '###  ###',
    '##    ##',
  ],
  'X': [
    '##    ##',
    ' ##  ## ',
    '  ####  ',
    '   ##   ',
    '   ##   ',
    '  ####  ',
    ' ##  ## ',
    '##    ##',
  ],
  'Y': [
    '##    ##',
    ' ##  ## ',
    '  ####  ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
  ],
  'Z': [
    '########',
    '     ## ',
    '    ##  ',
    '   ##   ',
    '  ##    ',
    ' ##     ',
    '##      ',
    '########',
  ],
  '0': [
    ' ###### ',
    '##    ##',
    '##   ###',
    '##  ####',
    '## ## ##',
    '####  ##',
    '###   ##',
    ' ###### ',
  ],
  '1': [
    '   ##   ',
    '  ###   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '########',
  ],
  '2': [
    ' ###### ',
    '##    ##',
    '      ##',
    '     ## ',
    '   ##   ',
    ' ##     ',
    '##      ',
    '########',
  ],
  '3': [
    ' ###### ',
    '##    ##',
    '      ##',
    '  ####  ',
    '      ##',
    '      ##',
    '##    ##',
    ' ###### ',
  ],
  '4': [
    '   ##   ',
    '  ###   ',
    ' ####   ',
    '## ##   ',
    '########',
    '   ##   ',
    '   ##   ',
    '   ##   ',
  ],
  '5': [
    '########',
    '##      ',
    '##      ',
    '###### ',
    '     ## ',
    '      ##',
    '##    ##',
    ' ###### ',
  ],
  '6': [
    ' ###### ',
    '##    ##',
    '##      ',
    '######  ',
    '##   ## ',
    '##    ##',
    '##    ##',
    ' ###### ',
  ],
  '7': [
    '########',
    '     ## ',
    '    ##  ',
    '   ##   ',
    '  ##    ',
    ' ##     ',
    '##      ',
    '##      ',
  ],
  '8': [
    ' ###### ',
    '##    ##',
    '##    ##',
    ' ###### ',
    '##    ##',
    '##    ##',
    '##    ##',
    ' ###### ',
  ],
  '9': [
    ' ###### ',
    '##    ##',
    '##    ##',
    '##   ## ',
    ' ###### ',
    '      ##',
    '##    ##',
    ' ###### ',
  ],
  ' ': [
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
  ],
  '-': [
    '        ',
    '        ',
    '        ',
    '  ####  ',
    '  ####  ',
    '        ',
    '        ',
    '        ',
  ],
  '.': [
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
    '   ##   ',
    '   ##   ',
  ],
  ':': [
    '        ',
    '   ##   ',
    '   ##   ',
    '        ',
    '        ',
    '   ##   ',
    '   ##   ',
    '        ',
  ],
};

/** Map a 2�4 pixel pattern to a Unicode block char.
 * Bits layout: top-left, top-right, mid1-left, mid1-right, mid2-left, mid2-right, bottom-left, bottom-right.
 * We use Braille (U+2800) instead of block quadrants for 8-dot mapping  more coverage.
 */
function pixelsToBraille(pixels: boolean[]): string {
  // Braille pattern bits: [0] => dot 1, [1] => dot 4, [2] => dot 2, [3] => dot 5, [4] => dot 3, [5] => dot 6, [6] => dot 7, [7] => dot 8
  // Our pixels: arranged as 2 wide � 4 tall => map to braille dots
  const mapping = [0, 3, 1, 4, 2, 5, 6, 7];
  let code = 0x2800;
  for (let i = 0; i < 8; i++) {
    if (pixels[i]) code |= 1 << mapping[i];
  }
  return String.fromCharCode(code);
}

/** Map a 2×2 pixel pattern to a Unicode quadrant block char.
 * Uses quadrant characters U+2596-U+259F for block-style rendering.
 */
function pixelsToQuadrant(pixels: boolean[]): string {
  // pixels[0] = top-left, pixels[1] = top-right, pixels[2] = bottom-left, pixels[3] = bottom-right
  const [tl, tr, bl, br] = pixels;
  
  // Map 4-bit pattern to quadrant character
  if (!tl && !tr && !bl && !br) return ' ';      // 0000 - empty
  if (tl && !tr && !bl && !br) return '▘';       // 1000 - U+2598
  if (!tl && tr && !bl && !br) return '▝';       // 0100 - U+259D
  if (tl && tr && !bl && !br) return '▀';        // 1100 - U+2580
  if (!tl && !tr && bl && !br) return '▖';       // 0010 - U+2596
  if (tl && !tr && bl && !br) return '▌';        // 1010 - U+258C
  if (!tl && tr && bl && !br) return '▞';        // 0110 - U+259E
  if (tl && tr && bl && !br) return '▛';         // 1110 - U+259B
  if (!tl && !tr && !bl && br) return '▗';       // 0001 - U+2597
  if (tl && !tr && !bl && br) return '▚';        // 1001 - U+259A
  if (!tl && tr && !bl && br) return '▐';        // 0101 - U+2590
  if (tl && tr && !bl && br) return '▜';         // 1101 - U+259C
  if (!tl && !tr && bl && br) return '▄';        // 0011 - U+2584
  if (tl && !tr && bl && br) return '▙';         // 1011 - U+2599
  if (!tl && tr && bl && br) return '▟';         // 0111 - U+259F
  if (tl && tr && bl && br) return '█';          // 1111 - U+2588
  
  return ' '; // fallback
}

// Optimized 6×6 bitmap font designed specifically for 3×3 block rendering
const FONT_3X3: Record<string, HRGlyph> = {
  'A': [
    ' #### ',
    '##  ##',
    '##  ##',
    '######',
    '##  ##',
    '##  ##',
  ],
  'B': [
    '##### ',
    '##  ##',
    '##### ',
    '##### ',
    '##  ##',
    '##### ',
  ],
  'C': [
    ' #####',
    '##    ',
    '##    ',
    '##    ',
    '##    ',
    ' #####',
  ],
  'D': [
    '##### ',
    '##  ##',
    '##  ##',
    '##  ##',
    '##  ##',
    '##### ',
  ],
  'E': [
    '######',
    '##    ',
    '####  ',
    '####  ',
    '##    ',
    '######',
  ],
  'F': [
    '######',
    '##    ',
    '####  ',
    '####  ',
    '##    ',
    '##    ',
  ],
  'G': [
    ' #####',
    '##    ',
    '## ###',
    '##  ##',
    '##  ##',
    ' #####',
  ],
  'H': [
    '##  ##',
    '##  ##',
    '######',
    '######',
    '##  ##',
    '##  ##',
  ],
  'I': [
    '######',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '######',
  ],
  'J': [
    '######',
    '   ## ',
    '   ## ',
    '   ## ',
    '##  ##',
    ' #### ',
  ],
  'K': [
    '##  ##',
    '## ## ',
    '####  ',
    '####  ',
    '## ## ',
    '##  ##',
  ],
  'L': [
    '##    ',
    '##    ',
    '##    ',
    '##    ',
    '##    ',
    '######',
  ],
  'M': [
    '##  ##',
    '######',
    '## ###',
    '##  ##',
    '##  ##',
    '##  ##',
  ],
  'N': [
    '##  ##',
    '### ##',
    '######',
    '## ###',
    '##  ##',
    '##  ##',
  ],
  'O': [
    ' #### ',
    '##  ##',
    '##  ##',
    '##  ##',
    '##  ##',
    ' #### ',
  ],
  'P': [
    '##### ',
    '##  ##',
    '##### ',
    '##    ',
    '##    ',
    '##    ',
  ],
  'Q': [
    ' #### ',
    '##  ##',
    '##  ##',
    '## ###',
    '##  ##',
    ' #####',
  ],
  'R': [
    '##### ',
    '##  ##',
    '##### ',
    '## ## ',
    '##  ##',
    '##  ##',
  ],
  'S': [
    ' #####',
    '##    ',
    ' #### ',
    '    ##',
    '    ##',
    '##### ',
  ],
  'T': [
    '######',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
  ],
  'U': [
    '##  ##',
    '##  ##',
    '##  ##',
    '##  ##',
    '##  ##',
    ' #### ',
  ],
  'V': [
    '##  ##',
    '##  ##',
    '##  ##',
    '##  ##',
    ' #### ',
    '  ##  ',
  ],
  'W': [
    '##  ##',
    '##  ##',
    '##  ##',
    '## ###',
    '######',
    '##  ##',
  ],
  'X': [
    '##  ##',
    ' #### ',
    '  ##  ',
    '  ##  ',
    ' #### ',
    '##  ##',
  ],
  'Y': [
    '##  ##',
    ' #### ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
  ],
  'Z': [
    '######',
    '   ## ',
    '  ##  ',
    ' ##   ',
    '##    ',
    '######',
  ],
  '0': [
    ' #### ',
    '##  ##',
    '## ###',
    '### ##',
    '##  ##',
    ' #### ',
  ],
  '1': [
    '  ##  ',
    ' ###  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '######',
  ],
  '2': [
    ' #### ',
    '##  ##',
    '   ## ',
    ' ##   ',
    '##    ',
    '######',
  ],
  '3': [
    ' #### ',
    '##  ##',
    '  ### ',
    '   ## ',
    '##  ##',
    ' #### ',
  ],
  '4': [
    '  ### ',
    ' #### ',
    '## ## ',
    '######',
    '   ## ',
    '   ## ',
  ],
  '5': [
    '######',
    '##    ',
    '##### ',
    '    ##',
    '##  ##',
    ' #### ',
  ],
  '6': [
    ' #### ',
    '##    ',
    '##### ',
    '##  ##',
    '##  ##',
    ' #### ',
  ],
  '7': [
    '######',
    '   ## ',
    '  ##  ',
    ' ##   ',
    '##    ',
    '##    ',
  ],
  '8': [
    ' #### ',
    '##  ##',
    ' #### ',
    '##  ##',
    '##  ##',
    ' #### ',
  ],
  '9': [
    ' #### ',
    '##  ##',
    ' #####',
    '    ##',
    '##  ##',
    ' #### ',
  ],
  ' ': [
    '      ',
    '      ',
    '      ',
    '      ',
    '      ',
    '      ',
  ],
  '-': [
    '      ',
    '      ',
    ' #### ',
    ' #### ',
    '      ',
    '      ',
  ],
  '.': [
    '      ',
    '      ',
    '      ',
    '      ',
    '  ##  ',
    '  ##  ',
  ],
  ':': [
    '      ',
    '  ##  ',
    '      ',
    '      ',
    '  ##  ',
    '      ',
  ],
};

export function render3x3(text: string): string {
  const chars = text.toUpperCase().split('');
  const charWidth = FONT_3X3['A'][0]?.length ?? 6;
  const charHeight = FONT_3X3['A'].length ?? 6;
  const cellCols = Math.ceil(charWidth / 2);
  const cellRows = Math.ceil(charHeight / 2);

  let lines: string[] = [];

  for (let cellRow = 0; cellRow < cellRows; cellRow++) {
    let line = '';
    for (const ch of chars) {
      const glyph = FONT_3X3[ch] ?? FONT_3X3['A'];
      for (let cellCol = 0; cellCol < cellCols; cellCol++) {
        const pixels: boolean[] = [];
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const y = cellRow * 2 + dy;
            const x = cellCol * 2 + dx;
            pixels.push(glyph[y]?.[x] === '#');
          }
        }
        line += pixelsToQuadrant(pixels);
      }
      line += ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// Ultra-compact 4×4 bitmap font designed for 2×2 block rendering (1 cell per character)
const FONT_2X2: Record<string, HRGlyph> = {
  'A': [
    ' ## ',
    '#  #',
    '####',
    '#  #',
  ],
  'B': [
    '### ',
    '#  #',
    '### ',
    '### ',
  ],
  'C': [
    '####',
    '#   ',
    '#   ',
    '####',
  ],
  'D': [
    '### ',
    '#  #',
    '#  #',
    '### ',
  ],
  'E': [
    '####',
    '#   ',
    '### ',
    '####',
  ],
  'F': [
    '####',
    '#   ',
    '### ',
    '#   ',
  ],
  'G': [
    '####',
    '#   ',
    '# ##',
    '####',
  ],
  'H': [
    '#  #',
    '#  #',
    '####',
    '#  #',
  ],
  'I': [
    '####',
    ' ## ',
    ' ## ',
    '####',
  ],
  'J': [
    '####',
    '  # ',
    '#  #',
    ' ## ',
  ],
  'K': [
    '#  #',
    '# # ',
    '##  ',
    '# # ',
  ],
  'L': [
    '#   ',
    '#   ',
    '#   ',
    '####',
  ],
  'M': [
    '#  #',
    '####',
    '####',
    '#  #',
  ],
  'N': [
    '#  #',
    '## #',
    '# ##',
    '#  #',
  ],
  'O': [
    ' ## ',
    '#  #',
    '#  #',
    ' ## ',
  ],
  'P': [
    '### ',
    '#  #',
    '### ',
    '#   ',
  ],
  'Q': [
    ' ## ',
    '#  #',
    '# ##',
    ' ###',
  ],
  'R': [
    '### ',
    '#  #',
    '### ',
    '# # ',
  ],
  'S': [
    '####',
    '#   ',
    ' ## ',
    '####',
  ],
  'T': [
    '####',
    ' ## ',
    ' ## ',
    ' ## ',
  ],
  'U': [
    '#  #',
    '#  #',
    '#  #',
    ' ## ',
  ],
  'V': [
    '#  #',
    '#  #',
    ' ## ',
    ' ## ',
  ],
  'W': [
    '#  #',
    '#  #',
    '####',
    '# # ',
  ],
  'X': [
    '#  #',
    ' ## ',
    ' ## ',
    '#  #',
  ],
  'Y': [
    '#  #',
    ' ## ',
    ' ## ',
    ' ## ',
  ],
  'Z': [
    '####',
    '  # ',
    ' #  ',
    '####',
  ],
  '0': [
    ' ## ',
    '#  #',
    '#  #',
    ' ## ',
  ],
  '1': [
    ' #  ',
    '##  ',
    ' #  ',
    '### ',
  ],
  '2': [
    '### ',
    '  # ',
    ' #  ',
    '### ',
  ],
  '3': [
    '### ',
    ' ## ',
    '  # ',
    '### ',
  ],
  '4': [
    '#  #',
    '####',
    '   #',
    '   #',
  ],
  '5': [
    '### ',
    '##  ',
    '  # ',
    '### ',
  ],
  '6': [
    ' ## ',
    '##  ',
    '### ',
    ' ## ',
  ],
  '7': [
    '### ',
    '  # ',
    ' #  ',
    '#   ',
  ],
  '8': [
    ' ## ',
    ' ## ',
    '### ',
    ' ## ',
  ],
  '9': [
    ' ## ',
    '### ',
    '  # ',
    ' ## ',
  ],
  ' ': [
    '    ',
    '    ',
    '    ',
    '    ',
  ],
  '-': [
    '    ',
    '####',
    '    ',
    '    ',
  ],
  '.': [
    '    ',
    '    ',
    '    ',
    ' ## ',
  ],
  ':': [
    '    ',
    ' ## ',
    '    ',
    ' ## ',
  ],
};

// Enhanced compact font using box drawing and special characters for clarity
const FONT_MINI: Record<string, string[]> = {
  'A': ['┌┐', '├┤'],
  'B': ['┬┐', '┴┘'],
  'C': ['┌─', '└─'],
  'D': ['┬┐', '┴┘'],
  'E': ['┬─', '├─'],
  'F': ['┬─', '├ '],
  'G': ['┌─', '└┐'],
  'H': ['│││', '│││'],
  'I': ['┬┬', '┴┴'],
  'J': [' │', '└┘'],
  'K': ['├┤', '├┤'],
  'L': ['│ ', '└─'],
  'M': ['╔╗', '║║'],
  'N': ['╔╗', '╚╝'],
  'O': ['┌┐', '└┘'],
  'P': ['┬┐', '├ '],
  'Q': ['┌┐', '└┤'],
  'R': ['┬┐', '├┤'],
  'S': ['┌─', '└┘'],
  'T': ['┬┬', ' │'],
  'U': ['││', '└┘'],
  'V': ['││', '└┘'],
  'W': ['││', '╚╝'],
  'X': ['├┤', '├┤'],
  'Y': ['├┤', ' │'],
  'Z': ['─┐', '└─'],
  '0': ['┌┐', '└┘'],
  '1': [' │', ' │'],
  '2': ['┌┐', '└─'],
  '3': ['─┐', '─┘'],
  '4': ['├┤', ' │'],
  '5': ['├─', '└┘'],
  '6': ['┌─', '├┘'],
  '7': ['─┐', ' │'],
  '8': ['┌┐', '├┤'],
  '9': ['┌┤', '└┘'],
  ' ': ['  ', '  '],
  '-': ['  ', '──'],
  '.': ['  ', ' ●'],
  ':': [' ●', ' ●'],
};

export function render2x2(text: string): string {
  const chars = text.toUpperCase().split('');
  const charWidth = FONT_2X2['A'][0]?.length ?? 4;
  const charHeight = FONT_2X2['A'].length ?? 4;
  const cellCols = Math.ceil(charWidth / 2);
  const cellRows = Math.ceil(charHeight / 2);

  let lines: string[] = [];

  for (let cellRow = 0; cellRow < cellRows; cellRow++) {
    let line = '';
    for (const ch of chars) {
      const glyph = FONT_2X2[ch] ?? FONT_2X2['A'];
      for (let cellCol = 0; cellCol < cellCols; cellCol++) {
        const pixels: boolean[] = [];
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const y = cellRow * 2 + dy;
            const x = cellCol * 2 + dx;
            pixels.push(glyph[y]?.[x] === '#');
          }
        }
        line += pixelsToQuadrant(pixels);
      }
      line += ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function renderMini(text: string): string {
  const chars = text.toUpperCase().split('');
  let lines = ['', ''];
  
  for (const ch of chars) {
    const glyph = FONT_MINI[ch] ?? FONT_MINI['A'];
    lines[0] += glyph[0] + ' ';
    lines[1] += glyph[1] + ' ';
  }
  
  return lines.join('\n');
}

export function renderHR(text: string): string {
  const chars = text.toUpperCase().split('');
  const charWidth = FONT_HR['A'][0]?.length ?? 8;
  const charHeight = FONT_HR['A'].length ?? 8;
  const cellCols = Math.ceil(charWidth / 2);
  const cellRows = Math.ceil(charHeight / 4);

  let lines: string[] = [];

  for (let cellRow = 0; cellRow < cellRows; cellRow++) {
    let line = '';
    for (const ch of chars) {
      const glyph = FONT_HR[ch] ?? FONT_HR['A'];
      for (let cellCol = 0; cellCol < cellCols; cellCol++) {
        const pixels: boolean[] = [];
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const y = cellRow * 4 + dy;
            const x = cellCol * 2 + dx;
            pixels.push(glyph[y]?.[x] === '#');
          }
        }
        line += pixelsToBraille(pixels);
      }
      line += ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function renderBlock(text: string): string {
  const chars = text.toUpperCase().split('');
  const charWidth = FONT_HR['A'][0]?.length ?? 8;
  const charHeight = FONT_HR['A'].length ?? 8;
  const cellCols = Math.ceil(charWidth / 2);
  const cellRows = Math.ceil(charHeight / 2); // Original full height

  let lines: string[] = [];

  for (let cellRow = 0; cellRow < cellRows; cellRow++) {
    let line = '';
    for (const ch of chars) {
      const glyph = FONT_HR[ch] ?? FONT_HR['A'];
      for (let cellCol = 0; cellCol < cellCols; cellCol++) {
        const pixels: boolean[] = [];
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const y = cellRow * 2 + dy; // Original 1:1 mapping
            const x = cellCol * 2 + dx;
            pixels.push(glyph[y]?.[x] === '#');
          }
        }
        line += pixelsToQuadrant(pixels);
      }
      line += ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}