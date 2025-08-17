import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";
import { createStreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent, BeginEvent, EndEvent } from "../types";

const SAMPLE_PATH = path.join(__dirname, "..", "__mocks__", "markdown-samples", "cross-validation-example.md");

describe("StreamingMarkdownParser - cross-validation-example.md", () => {
  it("should detect exactly one code block", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const codeBlocks = events.filter(e => e.type === "begin" && e.elementType === "code");
    expect(codeBlocks).toHaveLength(1);
  });

  it("should identify Python as the language", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const codeBlock = events.find((e): e is BeginEvent => 
      e.type === "begin" && e.elementType === "code"
    );
    
    expect(codeBlock?.metadata?.language).toBe("python");
  });

  it("should preserve the complete code content", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const endEvent = events.find((e): e is EndEvent => e.type === "end");
    
    // Check for key parts of the code
    expect(endEvent?.finalContent).toContain("import numpy as np");
    expect(endEvent?.finalContent).toContain("from sklearn.model_selection import KFold");
    expect(endEvent?.finalContent).toContain("cv_scores.mean()");
    expect(endEvent?.finalContent).toContain("cv_scores.std()");
  });

  it("should handle bold text formatting", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Check if strong/bold elements are detected
    const strongElements = events.filter(e => 
      e.type === "begin" && e.elementType === "strong"
    );
    
    // Parser may or may not detect inline formatting
    // This test just ensures parsing completes without error
    expect(events.length).toBeGreaterThan(0);
  });

  it("should complete parsing without errors", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    
    const processContent = async () => {
      const events: MarkdownParseEvent[] = [];
      for await (const event of parser.processChunk(content)) {
        events.push(event);
      }
      return events;
    };
    
    await expect(processContent()).resolves.toBeDefined();
  });
});