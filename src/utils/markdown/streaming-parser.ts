/**
 * Streaming markdown parser with both function-based and class-based APIs
 * Provides backward compatibility while using the new modular implementation
 */

import type {
  MarkdownParseEvent,
  MarkdownParserConfig,
} from "./types";

import { createParserState } from "./parser-state";
import { processCodeBlock, processNonCodeBlock } from "./block-processors";
import { cleanupBuffer } from "./parser-utils";

export function createStreamingMarkdownParser(config: MarkdownParserConfig = {}) {
  const state = createParserState(config);

  async function* processChunk(text: string): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    state.buffer += text;

    while (state.processedIndex < state.buffer.length) {
      const activeCodeBlock = state.activeBlocks.find(b => b.type === "code");
      
      if (activeCodeBlock) {
        yield* processCodeBlock(state, activeCodeBlock);
      } else {
        yield* processNonCodeBlock(state);
      }
    }

    cleanupBuffer(state);
  }

  async function* complete(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    // Close all remaining active blocks
    for (const block of state.activeBlocks) {
      yield {
        type: "end",
        elementId: block.id,
        finalContent: state.processBlockContent(block),
      };
    }
    
    state.reset();
  }

  function reset(): void {
    state.reset();
  }

  return {
    processChunk,
    complete,
    reset,
    state, // Expose state for debugging/testing
  };
}


