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

describe("openAIToClaudeStream", () => {
  it("should convert OpenAI stream chunks to Claude stream events", async () => {
    // Load mock data
    const mockDataPath = join(__dirname, "../__mocks__/openai-responses-stream-raw.jsonl");
    const jsonlContent = readFileSync(mockDataPath, "utf-8");

    // Convert to Claude stream using the reducer
    const messageId = "msg_test_123";
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
    
    // Snapshot test to prevent regression
    expect(claudeEvents).toMatchSnapshot();
  });

  it("should convert OpenAI web search stream to Claude stream events", async () => {
    // Load mock data
    const mockDataPath = join(__dirname, "../__mocks__/openai-websearch-stream-raw.jsonl");
    const jsonlContent = readFileSync(mockDataPath, "utf-8");

    // Convert to Claude stream using the reducer
    const messageId = "msg_websearch_test";
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
    expect(claudeEvents).toMatchSnapshot("web-search-stream");
  });
});
