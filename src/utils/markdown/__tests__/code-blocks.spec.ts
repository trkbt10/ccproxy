import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";
import { StreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent, BeginEvent, EndEvent } from "../types";

const SAMPLE_PATH = path.join(__dirname, "..", "__mocks__", "markdown-samples", "code-blocks.md");

describe("StreamingMarkdownParser - code-blocks.md", () => {
  it("should detect exactly 2 code blocks", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const codeBeginEvents = events.filter(e => e.type === "begin" && e.elementType === "code");
    expect(codeBeginEvents).toHaveLength(2);
  });

  it("should detect correct languages for code blocks", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const beginEvents = events.filter((e): e is BeginEvent => 
      e.type === "begin" && e.elementType === "code"
    );
    
    expect(beginEvents[0].metadata?.language).toBe("python");
    expect(beginEvents[1].metadata?.language).toBe("javascript");
  });

  it("should preserve double newlines inside code blocks", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const endEvents = events.filter((e): e is EndEvent => e.type === "end");
    
    // Python code block
    expect(endEvents[0].finalContent).toContain("# This has double newlines inside");
    expect(endEvents[0].finalContent).toContain("\n    \n    ");
    
    // JavaScript code block
    expect(endEvents[1].finalContent).toContain("// Multiple newlines here too");
    expect(endEvents[1].finalContent).toContain("\n    \n    \n    ");
  });

  it("should have matching begin and end events", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const beginEvents = events.filter(e => e.type === "begin");
    const endEvents = events.filter(e => e.type === "end");
    
    expect(beginEvents.length).toBe(endEvents.length);
    
    // Check that element IDs match
    beginEvents.forEach(begin => {
      const matchingEnd = endEvents.find(end => end.elementId === begin.elementId);
      expect(matchingEnd).toBeDefined();
    });
  });
});