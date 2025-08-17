/**
 * Streaming Markdown Parser for Gemini responses
 * This is now a thin wrapper around the generic markdown parser
 */

import { createStreamingMarkdownParser } from "../../../../utils/markdown/streaming-parser";
import type { MarkdownParseEvent, MarkdownElementType, MarkdownParserConfig } from "../../../../utils/markdown/types";

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
  parser: ReturnType<typeof createStreamingMarkdownParser>;
  config: GeminiMarkdownConfig;
}

// Create a new parser instance
export const createGeminiMarkdownParser = (config?: Partial<GeminiMarkdownConfig>): GeminiMarkdownParser => {
  const finalConfig = { ...defaultGeminiConfig, ...config };
  return {
    parser: createStreamingMarkdownParser(finalConfig),
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

