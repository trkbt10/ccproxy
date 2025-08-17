/**
 * Block processing functions for streaming markdown parser
 * Handles the logic for processing different block types
 */

import type { MarkdownParseEvent } from "./types";
import type { ParserState, BlockState } from "./parser-state";
import {
  detectBlock,
  detectLink,
  detectDoubleNewline,
  detectQuoteContinuation,
} from "./block-detectors";

export async function* processCodeBlock(
  state: ParserState,
  activeCodeBlock: BlockState
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  const remaining = state.buffer.slice(state.processedIndex);
  const endMatch = remaining.match(/^```\s*$/m);
  
  if (endMatch && endMatch.index !== undefined) {
    // Extract content up to end marker
    const content = remaining.slice(0, endMatch.index);
    activeCodeBlock.content += content;
    
    // Emit final content
    yield {
      type: "end",
      elementId: activeCodeBlock.id,
      finalContent: activeCodeBlock.content.trim(),
    };
    
    // Remove from active blocks
    state.activeBlocks = state.activeBlocks.filter(b => b.id !== activeCodeBlock.id);
    state.processedIndex += content.length + endMatch[0].length;
    
    // Skip newline after closing ```
    if (state.buffer[state.processedIndex] === '\n') {
      state.processedIndex++;
    }
  } else {
    // Accumulate content, emit deltas on newlines
    const nextNewline = remaining.indexOf('\n');
    if (nextNewline > 0) {
      const chunk = remaining.slice(0, nextNewline + 1);
      activeCodeBlock.content += chunk;
      state.processedIndex += chunk.length;
      
      yield {
        type: "delta",
        elementId: activeCodeBlock.id,
        content: activeCodeBlock.content,
      };
    } else if (remaining.length > 0) {
      // No newline yet, buffer the content
      // Do nothing - wait for more content
    }
  }
}

export async function* processNonCodeBlock(
  state: ParserState
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  const remaining = state.buffer.slice(state.processedIndex);
  
  // Try to detect a new block
  const detected = detectBlock(remaining);
  if (detected) {
    yield* handleDetectedBlock(state, detected, remaining);
    return;
  }

  // Check for links (inline annotations)
  const linkMatch = detectLink(remaining);
  if (linkMatch) {
    yield {
      type: "annotation",
      elementId: "text",
      annotation: {
        type: "url_citation",
        title: linkMatch.title,
        url: linkMatch.url,
        start_index: state.processedIndex + linkMatch.startIndex,
        end_index: state.processedIndex + linkMatch.endIndex,
      },
    };
    state.processedIndex += linkMatch.fullMatch.length;
    return;
  }

  // Handle blocks that end with \n\n
  if (detectDoubleNewline(remaining)) {
    yield* handleDoubleNewline(state);
    return;
  }

  // Accumulate content for active blocks
  if (state.activeBlocks.length > 0) {
    yield* accumulateBlockContent(state, remaining);
  } else {
    // No active blocks, skip character
    state.processedIndex++;
  }
}

async function* handleDetectedBlock(
  state: ParserState,
  detected: any,
  remaining: string
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  const id = state.generateId();
  
  // Emit begin event
  yield {
    type: "begin",
    elementType: detected.type,
    elementId: id,
    metadata: detected.metadata,
  };

  // For single-line elements (headers, horizontal rules), emit content and end immediately
  if (detected.content !== undefined) {
    yield {
      type: "delta",
      elementId: id,
      content: detected.content,
    };
    
    yield {
      type: "end",
      elementId: id,
      finalContent: detected.content,
    };
    
    state.processedIndex += detected.matchLength;
  } else {
    // Multi-line block, add to active blocks
    state.activeBlocks.push({
      id,
      type: detected.type,
      content: "",
      metadata: detected.metadata,
      startMarker: detected.startMarker,
      endMarker: detected.endMarker,
      contentStartIndex: state.processedIndex + detected.matchLength,
    });
    
    state.processedIndex += detected.matchLength;
  }
}

async function* handleDoubleNewline(
  state: ParserState
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  // Close all blocks that end with \n\n
  const blocksToClose = state.activeBlocks.filter(b => b.endMarker === null);
  
  for (const block of blocksToClose) {
    yield {
      type: "end",
      elementId: block.id,
      finalContent: state.processBlockContent(block),
    };
  }
  
  state.activeBlocks = state.activeBlocks.filter(b => b.endMarker !== null);
  state.processedIndex += 2;
}

async function* accumulateBlockContent(
  state: ParserState,
  remaining: string
): AsyncGenerator<MarkdownParseEvent, void, unknown> {
  // For quote blocks, check if line still starts with >
  const quoteBlocks = state.activeBlocks.filter(b => b.type === "quote");
  if (quoteBlocks.length > 0 && remaining[0] === '\n') {
    if (!detectQuoteContinuation(remaining)) {
      // Next line doesn't start with >, close quote blocks
      for (const block of quoteBlocks) {
        yield {
          type: "end",
          elementId: block.id,
          finalContent: state.processBlockContent(block),
        };
      }
      state.activeBlocks = state.activeBlocks.filter(b => b.type !== "quote");
    }
  }
  
  // Accumulate one character
  const char = remaining[0];
  for (const block of state.activeBlocks) {
    block.content += char;
  }
  
  // Emit deltas on newlines
  if (char === '\n') {
    for (const block of state.activeBlocks) {
      yield {
        type: "delta",
        elementId: block.id,
        content: state.processBlockContent(block),
      };
    }
  }
  
  state.processedIndex++;
}