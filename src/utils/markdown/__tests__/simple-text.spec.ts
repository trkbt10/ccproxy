import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";
import { createStreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent } from "../types";

const SAMPLE_PATH = path.join(__dirname, "..", "__mocks__", "markdown-samples", "simple-text.md");

describe("StreamingMarkdownParser - simple-text.md", () => {
  it("should not emit any events for plain text", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Plain text without markdown formatting should not produce events
    expect(events).toHaveLength(0);
  });

  it("should handle the content without errors", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    
    // Should process without throwing
    let processed = false;
    try {
      for await (const event of parser.processChunk(content)) {
        // Just consume events
      }
      processed = true;
    } catch (error) {
      processed = false;
    }
    
    expect(processed).toBe(true);
  });
});