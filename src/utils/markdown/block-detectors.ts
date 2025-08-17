/**
 * Block detection functions for markdown parsing
 * Each function returns detected block info or null
 */

import type { MarkdownElementType, MarkdownElementMetadata } from "./types";
import { detectTable as detectTableHelper, type TableMatch } from "./table-detector";

export interface DetectedBlock {
  type: MarkdownElementType;
  metadata?: MarkdownElementMetadata;
  startMarker: string;
  endMarker?: string | null;
  matchLength: number;
  content?: string; // For immediate content (like headers)
}

export function detectCodeBlock(text: string): DetectedBlock | null {
  const match = text.match(/^```([\w-]*)\n?/);
  if (!match || match.index !== 0) return null;

  return {
    type: "code",
    metadata: { language: match[1] || "text" },
    startMarker: match[0],
    endMarker: "```",
    matchLength: match[0].length,
  };
}

export function detectHeader(text: string): DetectedBlock | null {
  const match = text.match(/^(#{1,6})\s+(.+?)(?:\n|$)/);
  if (!match || match.index !== 0) return null;

  return {
    type: "header",
    metadata: { level: match[1].length },
    startMarker: match[0],
    matchLength: match[0].length,
    content: match[2],
  };
}

export function detectQuote(text: string): DetectedBlock | null {
  const match = text.match(/^>\s*/);
  if (!match || match.index !== 0) return null;

  return {
    type: "quote",
    startMarker: ">",
    endMarker: null, // ends with \n\n
    matchLength: match[0].length,
  };
}

export function detectList(text: string): DetectedBlock | null {
  // Unordered list
  const unorderedMatch = text.match(/^(\s*)[-*+]\s+/);
  if (unorderedMatch && unorderedMatch.index === 0) {
    const indent = unorderedMatch[1].length;
    const level = Math.floor(indent / 2) + 1;
    
    return {
      type: "list",
      metadata: { ordered: false, level },
      startMarker: unorderedMatch[0],
      endMarker: null,
      matchLength: unorderedMatch[0].length,
    };
  }

  // Ordered list
  const orderedMatch = text.match(/^(\s*)(\d+)\.\s+/);
  if (orderedMatch && orderedMatch.index === 0) {
    const indent = orderedMatch[1].length;
    const level = Math.floor(indent / 2) + 1;
    
    return {
      type: "list",
      metadata: { ordered: true, level },
      startMarker: orderedMatch[0],
      endMarker: null,
      matchLength: orderedMatch[0].length,
    };
  }

  return null;
}

export function detectHorizontalRule(text: string): DetectedBlock | null {
  const match = text.match(/^(---+|___+|\*\*\*+)\s*(?:\n|$)/);
  if (!match || match.index !== 0) return null;

  return {
    type: "horizontal_rule",
    startMarker: match[0],
    matchLength: match[0].length,
    content: match[1],
  };
}

export function detectMath(text: string): DetectedBlock | null {
  // Block math
  const blockMatch = text.match(/^\$\$\n?/);
  if (blockMatch && blockMatch.index === 0) {
    return {
      type: "math",
      metadata: { inline: false },
      startMarker: blockMatch[0],
      endMarker: "$$",
      matchLength: blockMatch[0].length,
    };
  }

  // Inline math
  const inlineMatch = text.match(/^\$/);
  if (inlineMatch && inlineMatch.index === 0) {
    return {
      type: "math",
      metadata: { inline: true },
      startMarker: "$",
      endMarker: "$",
      matchLength: 1,
    };
  }

  return null;
}

export interface LinkMatch {
  fullMatch: string;
  title: string;
  url: string;
  startIndex: number;
  endIndex: number;
}

export function detectLink(text: string): LinkMatch | null {
  const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)/);
  if (!match || match.index !== 0) return null;

  return {
    fullMatch: match[0],
    title: match[1],
    url: match[2],
    startIndex: 0,
    endIndex: match[0].length,
  };
}

export function detectTable(text: string): DetectedBlock | null {
  const tableMatch = detectTableHelper(text, 0);
  if (!tableMatch) return null;

  // For tables, we need to find the complete table to determine the end marker
  const lines = text.split("\n");
  let tableLines = 2; // header + separator
  
  // Count body rows
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i].trim() || !lines[i].trim().startsWith("|")) break;
    tableLines++;
  }
  
  const matchLength = lines.slice(0, tableLines).join("\n").length;

  return {
    type: "table",
    metadata: { alignments: tableMatch.alignments },
    startMarker: tableMatch.headerLine,
    endMarker: null, // Tables end with a non-table line
    matchLength,
  };
}

export function detectDoubleNewline(text: string): boolean {
  return text.startsWith("\n\n");
}

export function detectQuoteContinuation(text: string): boolean {
  const match = text.match(/^\n(>)?/);
  return !!(match && match[1]);
}

// Aggregate detector for all block types
export function detectBlock(text: string): DetectedBlock | null {
  // Order matters - check more specific patterns first
  const detectors = [
    detectCodeBlock,
    detectTable,
    detectMath,
    detectHeader,
    detectHorizontalRule,
    detectList,
    detectQuote,
  ];

  for (const detector of detectors) {
    const result = detector(text);
    if (result) return result;
  }

  return null;
}