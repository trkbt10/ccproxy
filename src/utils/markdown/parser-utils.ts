/**
 * Utility functions for the streaming markdown parser
 * Contains helper functions for buffer management and text processing
 */

import type { ParserState } from "./parser-state";

/**
 * Clean up the buffer periodically to prevent memory issues
 * Only cleans when it's safe (no active blocks and sufficient processed content)
 */
export function cleanupBuffer(state: ParserState): void {
  const bufferCleanupThreshold = state.config.maxBufferSize || 10000;
  
  if (
    state.processedIndex > bufferCleanupThreshold && 
    state.activeBlocks.length === 0
  ) {
    state.buffer = state.buffer.slice(state.processedIndex);
    state.processedIndex = 0;
  }
}

/**
 * Find the next occurrence of a pattern in text
 * Returns { index, match } or null
 */
export function findPattern(
  text: string, 
  pattern: string | RegExp, 
  startIndex: number = 0
): { index: number; match: string } | null {
  const searchText = text.slice(startIndex);
  
  if (typeof pattern === "string") {
    const index = searchText.indexOf(pattern);
    if (index === -1) return null;
    return { 
      index: startIndex + index, 
      match: pattern 
    };
  }
  
  const match = searchText.match(pattern);
  if (!match || match.index === undefined) return null;
  
  return { 
    index: startIndex + match.index, 
    match: match[0] 
  };
}

/**
 * Extract lines from text up to a certain index
 * Useful for processing line-based content
 */
export function extractLines(
  text: string, 
  startIndex: number, 
  endIndex: number
): string[] {
  const content = text.slice(startIndex, endIndex);
  return content.split('\n');
}

/**
 * Check if a character is whitespace
 */
export function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

/**
 * Count leading whitespace characters
 */
export function countLeadingWhitespace(line: string): number {
  let count = 0;
  for (const char of line) {
    if (isWhitespace(char)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Remove common leading whitespace from lines
 * Useful for dedenting code blocks
 */
export function dedentLines(lines: string[]): string[] {
  // Find minimum leading whitespace (excluding empty lines)
  let minIndent = Infinity;
  
  for (const line of lines) {
    if (line.trim().length > 0) {
      const indent = countLeadingWhitespace(line);
      minIndent = Math.min(minIndent, indent);
    }
  }
  
  if (minIndent === Infinity || minIndent === 0) {
    return lines;
  }
  
  // Remove common indent
  return lines.map(line => {
    if (line.trim().length === 0) return line;
    return line.slice(minIndent);
  });
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a regex pattern for matching block end markers
 */
export function createEndMarkerRegex(endMarker: string): RegExp {
  const escaped = escapeRegex(endMarker);
  return new RegExp(`^${escaped}\\s*$`, 'm');
}

/**
 * Normalize line endings to \n
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Check if text starts with a specific pattern at a given index
 */
export function startsWithAt(
  text: string, 
  pattern: string, 
  index: number
): boolean {
  return text.slice(index, index + pattern.length) === pattern;
}

/**
 * Extract metadata from a fenced code block language specifier
 * e.g., "typescript title=example.ts" -> { language: "typescript", title: "example.ts" }
 */
export function parseCodeBlockMetadata(langSpec: string): Record<string, string> {
  const parts = langSpec.split(/\s+/);
  const metadata: Record<string, string> = {};
  
  if (parts.length > 0 && parts[0]) {
    metadata.language = parts[0];
  }
  
  // Parse key=value pairs
  for (let i = 1; i < parts.length; i++) {
    const pair = parts[i].split('=');
    if (pair.length === 2) {
      metadata[pair[0]] = pair[1];
    }
  }
  
  return metadata;
}