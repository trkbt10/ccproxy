/**
 * Streaming Markdown Parser for Gemini responses
 * This is now a thin wrapper around the generic markdown parser
 */

import { StreamingMarkdownParser as BaseMarkdownParser } from "../../../../utils/markdown";
import type { MarkdownParseEvent, MarkdownElementType } from "../../../../utils/markdown";

// Re-export types for backward compatibility
export type { MarkdownElementType, MarkdownParseEvent } from "../../../../utils/markdown";

// Define configuration type
export interface GeminiMarkdownConfig {
  preserveWhitespace?: boolean;
  splitParagraphs?: boolean;
  idPrefix?: string;
}

// Default configuration for Gemini
const defaultGeminiConfig: GeminiMarkdownConfig = {
  preserveWhitespace: false,
  splitParagraphs: true,
  idPrefix: "gemini",
};

// Functional interface for the parser
export interface GeminiMarkdownParser {
  parser: BaseMarkdownParser;
  config: GeminiMarkdownConfig;
}

// Create a new parser instance
export const createGeminiMarkdownParser = (config?: Partial<GeminiMarkdownConfig>): GeminiMarkdownParser => {
  const finalConfig = { ...defaultGeminiConfig, ...config };
  return {
    parser: new BaseMarkdownParser(finalConfig),
    config: finalConfig,
  };
};

// Process a chunk of markdown text
export async function* processMarkdownChunk(
  parser: GeminiMarkdownParser,
  text: string
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  // Add any Gemini-specific pre-processing here if needed

  // Process through the base parser
  yield* parser.parser.processChunk(text);

  // Add any Gemini-specific post-processing here if needed
}

// Complete parsing and get any remaining events
export async function* completeMarkdownParsing(
  parser: GeminiMarkdownParser
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  yield* parser.parser.complete();
}

// Reset the parser state
export const resetMarkdownParser = (parser: GeminiMarkdownParser): void => {
  parser.parser.reset();
};

// For backward compatibility, export a class that wraps the functional implementation
export class StreamingMarkdownParser extends BaseMarkdownParser {
  private functionalParser: GeminiMarkdownParser;

  constructor() {
    // Initialize with Gemini-specific configuration
    super(defaultGeminiConfig);
    this.functionalParser = createGeminiMarkdownParser();
  }

  // Override to use functional implementation
  async *processChunk(text: string): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    yield* processMarkdownChunk(this.functionalParser, text);
  }

  reset(): void {
    super.reset();
    resetMarkdownParser(this.functionalParser);
  }
}
