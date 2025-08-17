import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";
import { StreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent, BeginEvent } from "../types";

const SAMPLE_PATH = path.join(__dirname, "..", "__mocks__", "markdown-samples", "large-content.md");

describe("StreamingMarkdownParser - large-content.md", () => {
  it("should handle large content efficiently", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    const startTime = Date.now();
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    const endTime = Date.now();
    
    // Should process in reasonable time (< 1 second)
    expect(endTime - startTime).toBeLessThan(1000);
    
    // Should produce events
    expect(events.length).toBeGreaterThan(0);
  });

  it("should detect headers at different levels", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const headers = events.filter((e): e is BeginEvent => 
      e.type === "begin" && e.elementType === "header"
    );
    
    // Should have headers at different levels
    const levels = new Set(headers.map(h => h.metadata?.level));
    expect(levels.size).toBeGreaterThan(1);
  });

  it("should detect large code blocks", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const codeBlocks = events.filter(e => e.type === "begin" && e.elementType === "code");
    expect(codeBlocks.length).toBeGreaterThan(0);
    
    // Check that large code block is preserved
    const endEvents = events.filter(e => e.type === "end");
    const largeCodeBlock = endEvents.find(e => 
      e.finalContent.includes("process_large_dataset")
    );
    
    expect(largeCodeBlock).toBeDefined();
    expect(largeCodeBlock?.finalContent).toContain("def process_large_dataset(data):");
    expect(largeCodeBlock?.finalContent).toContain("return final_result");
  });

  it("should handle streaming of large content", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    // Stream in smaller chunks
    const chunkSize = 100;
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      for await (const event of parser.processChunk(chunk)) {
        events.push(event);
      }
    }
    
    // Complete parsing
    for await (const event of parser.complete()) {
      events.push(event);
    }
    
    // Should still detect all elements
    const elementTypes = new Set(
      events.filter(e => e.type === "begin").map(e => e.elementType)
    );
    
    expect(elementTypes.has("header")).toBe(true);
    expect(elementTypes.has("code")).toBe(true);
  });

  it("should maintain correct element relationships", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Each begin should have a corresponding end
    const beginEvents = events.filter(e => e.type === "begin");
    const endEvents = events.filter(e => e.type === "end");
    
    beginEvents.forEach(begin => {
      const end = endEvents.find(e => e.elementId === begin.elementId);
      expect(end).toBeDefined();
    });
  });
});