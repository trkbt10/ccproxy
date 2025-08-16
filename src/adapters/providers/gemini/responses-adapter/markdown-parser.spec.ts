import { describe, it, expect, beforeEach } from "bun:test";
import { StreamingMarkdownParser, type MarkdownParseEvent } from "./markdown-parser";

describe("StreamingMarkdownParser", () => {
  let parser: StreamingMarkdownParser;

  beforeEach(() => {
    parser = new StreamingMarkdownParser();
  });

  describe("code blocks", () => {
    it("should emit begin/delta/end events for complete code block", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("```javascript\nconsole.log('hello');\n```")) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "code",
        metadata: { language: "javascript" }
      });
      expect(events[1]).toMatchObject({
        type: "delta",
        content: "console.log('hello');"
      });
      expect(events[2]).toMatchObject({
        type: "end",
        finalContent: "console.log('hello');"
      });
    });

    it("should handle incremental code block parsing", async () => {
      const events: MarkdownParseEvent[] = [];
      
      // First chunk - start of code block
      for await (const event of parser.processChunk("```python\n")) {
        events.push(event);
      }
      
      // Second chunk - partial content
      for await (const event of parser.processChunk("print('")) {
        events.push(event);
      }
      
      // Third chunk - more content
      for await (const event of parser.processChunk("hello')")) {
        events.push(event);
      }
      
      // Fourth chunk - end of code block
      for await (const event of parser.processChunk("\n```")) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "code",
        metadata: { language: "python" }
      });
      
      // Should have delta events for incremental content
      const deltaEvents = events.filter(e => e.type === "delta");
      expect(deltaEvents.length).toBeGreaterThan(0);
      
      // Should end with end event
      const endEvent = events[events.length - 1];
      expect(endEvent).toMatchObject({
        type: "end",
        finalContent: "print('hello')"
      });
    });

    it("should handle code block without language", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("```\nsome code\n```")) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "code",
        metadata: { language: "text" }
      });
    });
  });

  describe("headers", () => {
    it("should emit events for header", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("# Main Title")) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "header",
        metadata: { level: 1 }
      });
      expect(events[1]).toMatchObject({
        type: "delta",
        content: "Main Title"
      });
      expect(events[2]).toMatchObject({
        type: "end",
        finalContent: "Main Title"
      });
    });

    it("should handle different header levels", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("### Subtitle")) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        metadata: { level: 3 }
      });
    });
  });

  describe("quotes", () => {
    it("should emit events for quotes", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("> This is a quote")) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "quote"
      });
      expect(events[1]).toMatchObject({
        type: "delta",
        content: "This is a quote"
      });
      expect(events[2]).toMatchObject({
        type: "end",
        finalContent: "This is a quote"
      });
    });
  });

  describe("math expressions", () => {
    it("should emit events for math", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("$$x = y + z$$")) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "math"
      });
      expect(events[1]).toMatchObject({
        type: "delta",
        content: "x = y + z"
      });
      expect(events[2]).toMatchObject({
        type: "end",
        finalContent: "x = y + z"
      });
    });
  });

  describe("lists", () => {
    it("should emit events for list items", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("* First item")) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0]).toMatchObject({
        type: "begin",
        elementType: "list",
        metadata: { level: 0 }
      });
      expect(events[1]).toMatchObject({
        type: "delta",
        content: "First item"
      });
      expect(events[2]).toMatchObject({
        type: "end",
        finalContent: "First item"
      });
    });

    it("should handle nested lists", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("  * Nested item")) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        metadata: { level: 1 }
      });
    });
  });

  describe("tables", () => {
    it("should emit events for simple table", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("| Col1 | Col2 |\n| Row1 | Data1 |")) {
        events.push(event);
      }

      // Should have begin, deltas, and potentially end
      const beginEvents = events.filter(e => e.type === "begin");
      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0]).toMatchObject({
        elementType: "table"
      });
    });
  });

  describe("mixed content", () => {
    it("should handle multiple markdown elements", async () => {
      const events: MarkdownParseEvent[] = [];
      
      const mixedContent = `# Title
      
Some text content

\`\`\`javascript
console.log('test');
\`\`\`

> A quote

* List item`;

      for await (const event of parser.processChunk(mixedContent)) {
        events.push(event);
      }

      // Should have events for header, code, quote, and list
      const elementTypes = events
        .filter(e => e.type === "begin")
        .map(e => e.elementType);
      
      expect(elementTypes).toContain("header");
      expect(elementTypes).toContain("code");
      expect(elementTypes).toContain("quote");
      expect(elementTypes).toContain("list");
    });
  });

  describe("parser state", () => {
    it("should reset properly", () => {
      parser.processChunk("# Test").next();
      parser.reset();
      
      expect(parser.getBuffer()).toBe("");
      expect(parser.getActiveStates().size).toBe(0);
    });

    it("should track active states", async () => {
      // Start a code block but don't finish it
      for await (const event of parser.processChunk("```javascript\nconsole.log(")) {
        // Process events
      }
      
      const activeStates = parser.getActiveStates();
      expect(activeStates.size).toBe(1);
      
      const codeState = Array.from(activeStates.values())[0];
      expect(codeState.elementType).toBe("code");
    });
  });

  describe("element IDs", () => {
    it("should generate unique element IDs", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("# Title 1\n# Title 2")) {
        events.push(event);
      }

      const beginEvents = events.filter(e => e.type === "begin");
      expect(beginEvents.length).toBe(2);
      expect(beginEvents[0].elementId).not.toBe(beginEvents[1].elementId);
    });

    it("should maintain consistent IDs across begin/delta/end", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("# Title")) {
        events.push(event);
      }

      const elementId = events[0].elementId;
      expect(events[1].elementId).toBe(elementId);
      expect(events[2].elementId).toBe(elementId);
    });
  });

  describe("event ordering", () => {
    it("should maintain begin->delta->end order for each element", async () => {
      const events: MarkdownParseEvent[] = [];
      
      for await (const event of parser.processChunk("```js\nconsole.log('test');\n```")) {
        events.push(event);
      }

      // Group events by elementId
      const eventsByElement = new Map<string, MarkdownParseEvent[]>();
      events.forEach(event => {
        const elementEvents = eventsByElement.get(event.elementId) || [];
        elementEvents.push(event);
        eventsByElement.set(event.elementId, elementEvents);
      });

      // Check each element has correct order
      eventsByElement.forEach((elementEvents, elementId) => {
        expect(elementEvents[0].type).toBe("begin");
        expect(elementEvents[elementEvents.length - 1].type).toBe("end");
        
        // All delta events should be between begin and end
        for (let i = 1; i < elementEvents.length - 1; i++) {
          expect(elementEvents[i].type).toBe("delta");
        }
      });
    });

    it("should not have duplicate elements for same content", async () => {
      const events: MarkdownParseEvent[] = [];
      
      // Process same table twice
      const tableContent = "| Col1 | Col2 |\n| Data1 | Data2 |";
      for await (const event of parser.processChunk(tableContent)) {
        events.push(event);
      }
      
      // Process again to check no duplicates
      for await (const event of parser.processChunk("")) {
        events.push(event);
      }

      const beginEvents = events.filter(e => e.type === "begin" && e.elementType === "table");
      expect(beginEvents.length).toBe(1);
    });
  });
});