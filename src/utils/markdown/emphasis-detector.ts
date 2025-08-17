/**
 * Inline emphasis detection for markdown parsing
 * Handles bold, italic, strikethrough, and code
 */

export interface InlineEmphasis {
  type: "strong" | "emphasis" | "strikethrough" | "code";
  startIndex: number;
  endIndex: number;
  content: string;
  marker: string;
}

/**
 * Detect inline code spans
 * `code` or ``code with ` backtick``
 */
export function detectInlineCode(text: string, startIndex: number = 0): InlineEmphasis | null {
  const slice = text.slice(startIndex);
  
  // Check for double backticks first (for code containing single backticks)
  const doubleMatch = slice.match(/^``([^`]+)``/);
  if (doubleMatch) {
    return {
      type: "code",
      startIndex,
      endIndex: startIndex + doubleMatch[0].length,
      content: doubleMatch[1],
      marker: "``",
    };
  }
  
  // Single backticks
  const singleMatch = slice.match(/^`([^`]+)`/);
  if (singleMatch) {
    return {
      type: "code",
      startIndex,
      endIndex: startIndex + singleMatch[0].length,
      content: singleMatch[1],
      marker: "`",
    };
  }
  
  return null;
}

/**
 * Detect bold text
 * **bold** or __bold__
 */
export function detectStrong(text: string, startIndex: number = 0): InlineEmphasis | null {
  const slice = text.slice(startIndex);
  
  // Asterisks
  const asteriskMatch = slice.match(/^\*\*([^*]+)\*\*/);
  if (asteriskMatch) {
    return {
      type: "strong",
      startIndex,
      endIndex: startIndex + asteriskMatch[0].length,
      content: asteriskMatch[1],
      marker: "**",
    };
  }
  
  // Underscores
  const underscoreMatch = slice.match(/^__([^_]+)__/);
  if (underscoreMatch) {
    return {
      type: "strong",
      startIndex,
      endIndex: startIndex + underscoreMatch[0].length,
      content: underscoreMatch[1],
      marker: "__",
    };
  }
  
  return null;
}

/**
 * Detect italic/emphasis text
 * *italic* or _italic_
 */
export function detectEmphasis(text: string, startIndex: number = 0): InlineEmphasis | null {
  const slice = text.slice(startIndex);
  
  // Single asterisk (but not if it's part of **)
  if (!slice.startsWith("**")) {
    const asteriskMatch = slice.match(/^\*([^*]+)\*/);
    if (asteriskMatch) {
      return {
        type: "emphasis",
        startIndex,
        endIndex: startIndex + asteriskMatch[0].length,
        content: asteriskMatch[1],
        marker: "*",
      };
    }
  }
  
  // Single underscore (but not if it's part of __)
  if (!slice.startsWith("__")) {
    const underscoreMatch = slice.match(/^_([^_]+)_/);
    if (underscoreMatch) {
      return {
        type: "emphasis",
        startIndex,
        endIndex: startIndex + underscoreMatch[0].length,
        content: underscoreMatch[1],
        marker: "_",
      };
    }
  }
  
  return null;
}

/**
 * Detect strikethrough text
 * ~~strikethrough~~
 */
export function detectStrikethrough(text: string, startIndex: number = 0): InlineEmphasis | null {
  const slice = text.slice(startIndex);
  const match = slice.match(/^~~([^~]+)~~/);
  
  if (match) {
    return {
      type: "strikethrough",
      startIndex,
      endIndex: startIndex + match[0].length,
      content: match[1],
      marker: "~~",
    };
  }
  
  return null;
}

/**
 * Detect any inline emphasis at the current position
 * Returns the first match found
 */
export function detectInlineEmphasis(text: string, startIndex: number = 0): InlineEmphasis | null {
  // Order matters - check more specific patterns first
  const detectors = [
    detectInlineCode,      // Check code first (highest priority)
    detectStrikethrough,   // ~~text~~
    detectStrong,          // **text** or __text__
    detectEmphasis,        // *text* or _text_
  ];
  
  for (const detector of detectors) {
    const result = detector(text, startIndex);
    if (result) return result;
  }
  
  return null;
}

/**
 * Find all inline emphasis in a text range
 * Useful for preprocessing text blocks
 */
export function findAllInlineEmphasis(
  text: string, 
  startIndex: number = 0, 
  endIndex?: number
): InlineEmphasis[] {
  const results: InlineEmphasis[] = [];
  const end = endIndex ?? text.length;
  let pos = startIndex;
  
  while (pos < end) {
    const emphasis = detectInlineEmphasis(text, pos);
    if (emphasis) {
      results.push(emphasis);
      pos = emphasis.endIndex;
    } else {
      pos++;
    }
  }
  
  return results;
}