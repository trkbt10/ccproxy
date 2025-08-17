/**
 * State management for the streaming markdown parser
 * Encapsulates parser state and provides utility methods
 */

import type {
  MarkdownElementType,
  MarkdownElementMetadata,
  MarkdownParserConfig,
} from "./types";

export interface BlockState {
  id: string;
  type: MarkdownElementType;
  content: string;
  metadata?: MarkdownElementMetadata;
  startMarker: string;
  endMarker?: string | null; // null = ends with \n\n
  contentStartIndex: number;
}

export interface ParserState {
  buffer: string;
  processedIndex: number;
  activeBlocks: BlockState[];
  idCounter: number;
  config: MarkdownParserConfig;
  
  // Methods
  generateId(): string;
  processBlockContent(block: BlockState): string;
  reset(): void;
}

export function createParserState(config: MarkdownParserConfig = {}): ParserState {
  const mergedConfig: MarkdownParserConfig = {
    preserveWhitespace: false,
    splitParagraphs: true,
    idPrefix: "md",
    maxBufferSize: 10000,
    ...config,
  };

  const state: ParserState = {
    buffer: "",
    processedIndex: 0,
    activeBlocks: [],
    idCounter: 0,
    config: mergedConfig,

    generateId(): string {
      return `${this.config.idPrefix}-${++this.idCounter}`;
    },

    processBlockContent(block: BlockState): string {
      let content = block.content;
      
      // Process quote content - remove > prefix from each line
      if (block.type === "quote") {
        content = processQuoteContent(content);
      }
      
      // Process list content - handle indentation
      if (block.type === "list") {
        content = processListContent(content, block.metadata);
      }
      
      return this.config.preserveWhitespace ? content : content.trim();
    },

    reset(): void {
      this.buffer = "";
      this.processedIndex = 0;
      this.activeBlocks = [];
      // Keep idCounter to ensure unique IDs across resets
    },
  };

  return state;
}

// Helper functions for content processing
function processQuoteContent(content: string): string {
  return content
    .split('\n')
    .map(line => line.replace(/^>\s*/, ''))
    .join('\n');
}

function processListContent(content: string, metadata?: MarkdownElementMetadata): string {
  if (!metadata) return content;
  
  const lines = content.split('\n');
  const processedLines: string[] = [];
  
  for (const line of lines) {
    // Remove list markers
    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      processedLines.push(unorderedMatch[2]);
      continue;
    }
    
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (orderedMatch) {
      processedLines.push(orderedMatch[2]);
      continue;
    }
    
    // Keep line as-is if no list marker found
    processedLines.push(line);
  }
  
  return processedLines.join('\n');
}

// Factory function for creating block states
export function createBlockState(
  id: string,
  type: MarkdownElementType,
  startMarker: string,
  endMarker?: string | null,
  metadata?: MarkdownElementMetadata,
  contentStartIndex: number = 0
): BlockState {
  return {
    id,
    type,
    content: "",
    metadata,
    startMarker,
    endMarker,
    contentStartIndex,
  };
}