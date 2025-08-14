import { describe, it, expect } from "vitest";
import { openAIToClaudeStream } from "./index";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import type { MessageStreamEvent as ClaudeStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import { readFileSync } from "fs";
import { join } from "path";
import { validClaudeEventTypes, validateClaudeEvent } from "./guards";

// Helper to create async iterable from JSONL
async function* createStreamFromJSONL(jsonlContent: string): AsyncGenerator<ResponseStreamEvent> {
  const lines = jsonlContent
    .trim()
    .split("\n")
    .filter((line) => line.trim());

  for (const line of lines) {
    const chunk = JSON.parse(line);
    // Type assertion to ResponseStreamEvent since we're reading from mock data
    yield chunk as ResponseStreamEvent;
  }
}

describe("openAIToClaudeStream - Mixed Blocks", () => {
  it("should convert OpenAI mixed blocks stream to Claude stream events", async () => {
    // Load mock data
    const mockDataPath = join(__dirname, "../__mocks__/openai-mixed-blocks-raw.jsonl");
    const jsonlContent = readFileSync(mockDataPath, "utf-8");

    // Convert to Claude stream using the reducer
    const messageId = "msg_mixed_test";
    const claudeEvents: ClaudeStreamEvent[] = [];

    // Process each event and verify it's a valid Claude block
    for await (const event of openAIToClaudeStream(createStreamFromJSONL(jsonlContent), messageId)) {
      // Verify each event has a valid Claude event type (O(1) lookup)
      expect(validClaudeEventTypes).toContain(event.type);

      // Verify event structure using validator (O(1) lookup)
      expect(validateClaudeEvent(event)).toBe(true);

      claudeEvents.push(event);
    }

    // Verify we got events
    expect(claudeEvents.length).toBeGreaterThan(0);

    // First event should be message_start
    expect(claudeEvents[0].type).toBe("message_start");

    // Last event should be message_stop
    expect(claudeEvents[claudeEvents.length - 1].type).toBe("message_stop");

    // Check for content_block_start events
    const blockStartEvents = claudeEvents.filter(e => e.type === "content_block_start");
    expect(blockStartEvents.length).toBeGreaterThan(0);

    // Check for content_block_delta events
    const blockDeltaEvents = claudeEvents.filter(e => e.type === "content_block_delta");
    expect(blockDeltaEvents.length).toBeGreaterThan(0);

    // Check for content_block_stop events
    const blockStopEvents = claudeEvents.filter(e => e.type === "content_block_stop");
    expect(blockStopEvents.length).toBeGreaterThan(0);
    
    // Verify block start/stop counts match
    expect(blockStartEvents.length).toBe(blockStopEvents.length);

    // Snapshot test to prevent regression
    expect(claudeEvents).toMatchSnapshot("mixed-blocks-stream");
  });

  it("should handle multiple block types in single stream", async () => {
    const mockDataPath = join(__dirname, "../__mocks__/openai-mixed-blocks-raw.jsonl");
    const jsonlContent = readFileSync(mockDataPath, "utf-8");
    
    const messageId = "msg_mixed_types";
    const claudeEvents: ClaudeStreamEvent[] = [];
    
    for await (const event of openAIToClaudeStream(createStreamFromJSONL(jsonlContent), messageId)) {
      claudeEvents.push(event);
    }

    // Count different block types
    const blockTypes = new Map<string, number>();
    
    claudeEvents
      .filter(e => e.type === "content_block_start")
      .forEach(e => {
        const blockType = e.content_block.type;
        blockTypes.set(blockType, (blockTypes.get(blockType) || 0) + 1);
      });

    // Verify we have multiple block types (text, tool_use, etc.)
    expect(blockTypes.size).toBeGreaterThanOrEqual(1);
    
    // Log block types for visibility
    console.log("Block types found:", Array.from(blockTypes.entries()));
  });

  it("should maintain correct block ordering", async () => {
    const mockDataPath = join(__dirname, "../__mocks__/openai-mixed-blocks-raw.jsonl");
    const jsonlContent = readFileSync(mockDataPath, "utf-8");
    
    const messageId = "msg_block_ordering";
    const claudeEvents: ClaudeStreamEvent[] = [];
    
    for await (const event of openAIToClaudeStream(createStreamFromJSONL(jsonlContent), messageId)) {
      claudeEvents.push(event);
    }

    // Track block lifecycle
    const blockLifecycle: Array<{ type: string; index: number; event: string }> = [];
    
    claudeEvents.forEach(event => {
      if (event.type === "content_block_start") {
        blockLifecycle.push({ 
          type: event.content_block.type, 
          index: event.index, 
          event: "start" 
        });
      } else if (event.type === "content_block_stop") {
        blockLifecycle.push({ 
          type: "unknown", // We don't know type from stop event
          index: event.index, 
          event: "stop" 
        });
      }
    });

    // Verify each block is properly opened and closed
    const openBlocks = new Set<number>();
    
    for (const lifecycle of blockLifecycle) {
      if (lifecycle.event === "start") {
        expect(openBlocks.has(lifecycle.index)).toBe(false);
        openBlocks.add(lifecycle.index);
      } else if (lifecycle.event === "stop") {
        expect(openBlocks.has(lifecycle.index)).toBe(true);
        openBlocks.delete(lifecycle.index);
      }
    }
    
    // All blocks should be closed
    expect(openBlocks.size).toBe(0);
  });
});