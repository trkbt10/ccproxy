import { describe, expect, it, beforeEach } from "bun:test";
import { createStreamingMarkdownParser } from "../streaming-parser";
import type { MarkdownParseEvent } from "../types";

describe("StreamingMarkdownParser - IO Operations", () => {
  let parser: ReturnType<typeof createStreamingMarkdownParser>;

  beforeEach(() => {
    parser = createStreamingMarkdownParser();
  });

  describe("basic IO operations", () => {
    it("should handle empty input", async () => {
      const events: MarkdownParseEvent[] = [];
      for await (const event of parser.processChunk("")) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });

    it("should handle single chunk processing", async () => {
      const events: MarkdownParseEvent[] = [];
      for await (const event of parser.processChunk("```js\ncode\n```")) {
        events.push(event);
      }
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("begin");
    });

    it("should handle streaming chunks", async () => {
      const text = "```python\nprint('hello')\n```";
      const events: MarkdownParseEvent[] = [];
      
      // Process in small chunks
      for (let i = 0; i < text.length; i += 5) {
        const chunk = text.slice(i, i + 5);
        for await (const event of parser.processChunk(chunk)) {
          events.push(event);
        }
      }
      
      // Should still produce valid events
      const beginEvents = events.filter(e => e.type === "begin");
      const endEvents = events.filter(e => e.type === "end");
      expect(beginEvents.length).toBeGreaterThan(0);
      expect(endEvents.length).toBeGreaterThan(0);
    });

    it("should handle complete() method", async () => {
      const events: MarkdownParseEvent[] = [];
      
      // Process incomplete code block
      for await (const event of parser.processChunk("```js\nincomplete")) {
        events.push(event);
      }
      
      // Complete parsing
      for await (const event of parser.complete()) {
        events.push(event);
      }
      
      // Should have events from both processChunk and complete
      expect(events.length).toBeGreaterThan(0);
    });

    it("should reset state properly", async () => {
      // First parse
      const events1: MarkdownParseEvent[] = [];
      for await (const event of parser.processChunk("```\nfirst\n```")) {
        events1.push(event);
      }
      
      // Reset
      parser.reset();
      
      // Second parse
      const events2: MarkdownParseEvent[] = [];
      for await (const event of parser.processChunk("```\nsecond\n```")) {
        events2.push(event);
      }
      
      // Check that second parse doesn't contain first content
      const endEvent = events2.find(e => e.type === "end");
      expect(endEvent?.finalContent).toBe("second");
      expect(endEvent?.finalContent).not.toContain("first");
    });
  });

  describe("async generator behavior", () => {
    it("should yield events as they are generated", async () => {
      const eventTypes: string[] = [];
      
      for await (const event of parser.processChunk("# Header\n```js\ncode\n```")) {
        eventTypes.push(event.type);
      }
      
      // Should have events in order: begin, delta, end for each element
      expect(eventTypes).toContain("begin");
      expect(eventTypes).toContain("delta");
      expect(eventTypes).toContain("end");
    });

    it("should handle errors gracefully", async () => {
      // This test depends on implementation details
      // The parser should handle malformed input without throwing
      const events: MarkdownParseEvent[] = [];
      
      try {
        for await (const event of parser.processChunk("```\n\n```\n```")) {
          events.push(event);
        }
        // Should complete without throwing
        expect(true).toBe(true);
      } catch (error) {
        // If it throws, the test fails
        expect(error).toBeUndefined();
      }
    });
  });
});