import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";
import { createStreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent, BeginEvent } from "../types";

const SAMPLE_PATH = path.join(__dirname, "..", "__mocks__", "markdown-samples", "mixed-content.md");

describe("StreamingMarkdownParser - mixed-content.md", () => {
  it("should detect multiple markdown element types", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Count different element types
    const elementTypes = new Set(
      events
        .filter(e => e.type === "begin")
        .map(e => e.elementType)
    );
    
    // Should detect at least headers and code blocks
    expect(elementTypes.has("header")).toBe(true);
    expect(elementTypes.has("code")).toBe(true);
  });

  it("should detect all headers with correct levels", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const headerEvents = events.filter((e): e is BeginEvent => 
      e.type === "begin" && e.elementType === "header"
    );
    
    // Count headers by level
    const headersByLevel = new Map<number, number>();
    headerEvents.forEach(event => {
      const level = event.metadata?.level || 0;
      headersByLevel.set(level, (headersByLevel.get(level) || 0) + 1);
    });
    
    expect(headersByLevel.get(1)).toBeGreaterThan(0); // # headers
    expect(headersByLevel.get(2)).toBeGreaterThan(0); // ## headers
    expect(headersByLevel.get(3)).toBeGreaterThan(0); // ### headers
  });

  it("should detect code blocks including nested markdown", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const codeBlocks = events.filter((e): e is BeginEvent => 
      e.type === "begin" && e.elementType === "code"
    );
    
    // Should have Python and markdown code blocks
    const languages = codeBlocks.map(e => e.metadata?.language).filter(Boolean);
    expect(languages).toContain("python");
    expect(languages).toContain("markdown");
  });

  it("should detect links", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    const linkAnnotations = events.filter(e => 
      e.type === "annotation" && e.annotation.type === "url_citation"
    );
    
    expect(linkAnnotations.length).toBeGreaterThan(0);
    
    // Check for OpenAI link
    const openAILink = linkAnnotations.find(e => 
      e.annotation.type === "url_citation" && 
      "url" in e.annotation &&
      e.annotation.url === "https://openai.com"
    );
    expect(openAILink).toBeDefined();
  });

  it("should handle multiple consecutive newlines correctly", async () => {
    const content = await readFile(SAMPLE_PATH, "utf-8");
    const parser = createStreamingMarkdownParser();
    const events: MarkdownParseEvent[] = [];
    
    for await (const event of parser.processChunk(content)) {
      events.push(event);
    }
    
    // Parser should process the content without errors
    // Multiple newlines in plain text don't produce special events
    expect(events.length).toBeGreaterThan(0);
  });
});