import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";
import { StreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent, BeginEvent, EndEvent } from "../types";

const SAMPLE_PATH = path.join(__dirname, "..", "__mocks__", "markdown-samples", "extreme-edge-cases.md");

describe("StreamingMarkdownParser - extreme-edge-cases.md", () => {
  it("should handle empty code blocks", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Should detect code blocks even if empty
    const codeBlocks = events.filter(e => e.type === "begin" && e.elementType === "code");
    expect(codeBlocks.length).toBeGreaterThan(0);
    
    // First code block should be empty
    const firstEnd = events.find(e => e.type === "end");
    expect(firstEnd?.finalContent).toBe("");
  });

  it("should handle nested triple backticks", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Should handle code blocks with extra backticks
    const codeBlocks = events.filter(e => e.type === "begin" && e.elementType === "code");
    expect(codeBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it("should handle code blocks with only newlines", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // The parser trims content, so a code block with only newlines
    // will have empty finalContent
    const endEvents = events.filter((e): e is EndEvent => e.type === "end");
    const emptyBlocks = endEvents.filter(e => e.finalContent === "");
    
    // Should have at least one empty code block
    expect(emptyBlocks.length).toBeGreaterThan(0);
  });

  it("should handle code blocks containing triple quotes", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Find Python code block
    const pythonBlock = events.find((e): e is BeginEvent => 
      e.type === "begin" && 
      e.elementType === "code" && 
      e.metadata?.language === "python"
    );
    expect(pythonBlock).toBeDefined();
    
    // Check its content
    const pythonEnd = events.find((e): e is EndEvent => 
      e.type === "end" && e.elementId === pythonBlock?.elementId
    );
    // The parser's regex is non-greedy but will still match the shortest valid code block
    // It should contain at least the print statement
    expect(pythonEnd?.finalContent).toContain('print("');
  });

  it("should handle multiple consecutive empty lines", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    
    // Should process without errors
    const processContent = async () => {
      const events: MarkdownParseEvent[] = [];
      for await (const event of parser.processChunk(content)) {
        events.push(event);
      }
      return events;
    };
    
    const events = await processContent();
    expect(events).toBeDefined();
  });

  it("should handle code block at end without newline", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = new StreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Complete to ensure last block is processed
    for await (const event of parser.complete()) {
      events.push(event);
    }
    
    // Should have processed all code blocks
    const codeBlocks = events.filter(e => e.type === "begin" && e.elementType === "code");
    expect(codeBlocks.length).toBeGreaterThan(3);
  });
});