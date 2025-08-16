import { beforeEach, describe, expect, it } from "bun:test";
import type { ResponseStreamEvent } from "../../openai-generic/responses-adapter/types";
import type { StreamedPart } from "../client/fetch-client";
import { GeminiStreamHandler } from "./stream-handler";

describe("GeminiStreamHandler", () => {
  let handler: GeminiStreamHandler;

  beforeEach(() => {
    handler = new GeminiStreamHandler();
  });

  async function collectEvents(parts: StreamedPart[]): Promise<ResponseStreamEvent[]> {
    const events: ResponseStreamEvent[] = [];
    
    async function* mockStream() {
      for (const part of parts) {
        yield part;
      }
    }
    
    for await (const event of handler.handleStream(mockStream())) {
      events.push(event);
    }
    
    return events;
  }

  describe("basic flow", () => {
    it("should emit response.created at start", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Hello" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      expect(events[0]).toMatchObject({
        type: "response.created"
      });
      expect(events[0].response).toBeDefined();
      expect(events[0].response.status).toBe("in_progress");
    });

    it("should emit response.completed at end", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Hello" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const completedEvent = events[events.length - 1];
      expect(completedEvent).toMatchObject({
        type: "response.completed"
      });
      expect(completedEvent.response.status).toBe("completed");
    });
  });

  describe("text handling", () => {
    it("should emit correct sequence: output_item.added -> deltas -> done", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Hello world!" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Find text-related events
      const textItemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "output_text"
      );
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      const textDone = events.find(e => e.type === "response.output_text.done");
      const textItemDone = events.find(e => 
        e.type === "response.output_item.done" && 
        e.item.type === "output_text"
      );
      
      // Verify correct sequence
      expect(textItemAdded).toBeDefined();
      expect(textDeltas.length).toBeGreaterThan(0);
      expect(textDone).toBeDefined();
      expect(textItemDone).toBeDefined();
      
      // Verify order: added -> deltas -> text done -> item done
      const addedIndex = events.findIndex(e => e === textItemAdded);
      const firstDeltaIndex = events.findIndex(e => e === textDeltas[0]);
      const textDoneIndex = events.findIndex(e => e === textDone);
      const itemDoneIndex = events.findIndex(e => e === textItemDone);
      
      expect(addedIndex).toBeLessThan(firstDeltaIndex);
      expect(firstDeltaIndex).toBeLessThan(textDoneIndex);
      expect(textDoneIndex).toBeLessThan(itemDoneIndex);
      
      // Verify content
      expect(textDone?.text).toBe("Hello world!");
      expect(textItemDone?.item.text).toBe("Hello world!");
    });

    it("should handle incremental text updates", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "First chunk " },
        { type: "text", text: "second chunk " },
        { type: "text", text: "third chunk" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have one output_item.added at the beginning
      const itemAddedEvents = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "output_text"
      );
      expect(itemAddedEvents.length).toBe(1);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBe(3);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toBe("First chunk second chunk third chunk");
    });
  });

  describe("markdown code blocks", () => {
    it("should emit code interpreter events for code blocks", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "```javascript\n" },
        { type: "text", text: "console.log('hello');" },
        { type: "text", text: "\n```" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have code interpreter item added
      const itemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "code_interpreter_call"
      );
      expect(itemAdded).toBeDefined();
      expect(itemAdded?.item.id).toBeDefined();
      
      // Should have code interpreter item done
      const itemDone = events.find(e => 
        e.type === "response.output_item.done" && 
        e.item.type === "code_interpreter_call"
      );
      expect(itemDone).toBeDefined();
      expect(itemDone?.item.code).toBe("console.log('hello');");
      expect(itemDone?.item.status).toBe("completed");
    });

    it("should correctly identify code blocks with \\n\\n inside", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Here's the code:\n\n```python\nprint(f\"\\nCross-Validation Scores: {cv_scores}\")\n\nprint(f\"Mean CV Accuracy: {cv_scores.mean():.2f}\")\nprint(f\"Standard Deviation: {cv_scores.std():.2f}\")\n```\n\n**Explanation:** This demonstrates cross-validation." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have exactly one code interpreter block
      const codeBlocks = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "code_interpreter_call"
      );
      expect(codeBlocks.length).toBe(1);
      
      // Code should contain the \\n\\n
      const codeDone = events.find(e => 
        e.type === "response.output_item.done" && 
        e.item.type === "code_interpreter_call"
      );
      expect(codeDone?.item.code).toContain("print(f\"\\nCross-Validation Scores: {cv_scores}\")\n\nprint(f\"Mean CV Accuracy:");
      
      // Text deltas should be properly split outside code block
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      const hasExplanationDelta = textDeltas.some(d => d.delta.includes("**Explanation:**"));
      expect(hasExplanationDelta).toBe(true);
    });

    it("should handle code blocks with language metadata", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "```python\nprint('test')\n```" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const itemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "code_interpreter_call"
      );
      
      expect(itemAdded?.item.outputs?.[0]?.logs).toContain("python");
    });
  });

  describe("markdown other elements", () => {
    it("should emit text deltas for headers", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "# Main Title" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have output_text item added first
      const textItemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "output_text"
      );
      expect(textItemAdded).toBeDefined();
      
      // Headers should be treated as regular text, not special items
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
      
      // Should NOT have any reasoning items
      const reasoningItems = events.filter(e => 
        (e.type === "response.output_item.added" || e.type === "response.output_item.done") && 
        e.item.type === "reasoning"
      );
      expect(reasoningItems.length).toBe(0);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toContain("Main Title");
    });

    it("should emit text deltas for quotes", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "> This is a quote" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have output_text item added first
      const textItemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "output_text"
      );
      expect(textItemAdded).toBeDefined();
      
      // Quotes should be treated as regular text
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
      
      const reasoningItems = events.filter(e => 
        (e.type === "response.output_item.added" || e.type === "response.output_item.done") && 
        e.item.type === "reasoning"
      );
      expect(reasoningItems.length).toBe(0);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toContain("This is a quote");
    });

    it("should emit text deltas for lists", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "* First item" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Lists should be treated as regular text
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
      
      const reasoningItems = events.filter(e => 
        (e.type === "response.output_item.added" || e.type === "response.output_item.done") && 
        e.item.type === "reasoning"
      );
      expect(reasoningItems.length).toBe(0);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toContain("First item");
    });

    it("should emit text deltas for math blocks", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "$$ E = mc^2 $$" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Math blocks should be treated as regular text
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
      
      const reasoningItems = events.filter(e => 
        (e.type === "response.output_item.added" || e.type === "response.output_item.done") && 
        e.item.type === "reasoning"
      );
      expect(reasoningItems.length).toBe(0);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toContain("E = mc^2");
    });
  });

  describe("function calls", () => {
    it("should emit function call events", async () => {
      const parts: StreamedPart[] = [
        { 
          type: "functionCall", 
          functionCall: { 
            name: "test_function", 
            args: { param: "value" } 
          } 
        },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const itemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "function_call"
      );
      expect(itemAdded).toBeDefined();
      expect(itemAdded?.item.name).toBe("test_function");
      expect(itemAdded?.item.arguments).toBe('{"param":"value"}');
      
      const itemDone = events.find(e => 
        e.type === "response.output_item.done" && 
        e.item.type === "function_call"
      );
      expect(itemDone).toBeDefined();
    });

    it("should handle function calls without args", async () => {
      const parts: StreamedPart[] = [
        { 
          type: "functionCall", 
          functionCall: { name: "simple_function" } 
        },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const itemAdded = events.find(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "function_call"
      );
      expect(itemAdded?.item.arguments).toBe("{}");
    });
  });

  describe("annotations", () => {
    it("should emit annotation.added for markdown links", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Check out [TypeScript](https://www.typescriptlang.org \"TypeScript Language\") for more info." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have annotation event
      const annotationEvents = events.filter(e => e.type === "response.output_text.annotation.added");
      expect(annotationEvents.length).toBe(1);
      
      const annotation = annotationEvents[0];
      expect(annotation.annotation.type).toBe("url_citation");
      expect(annotation.annotation.url).toBe("https://www.typescriptlang.org");
      expect(annotation.annotation.title).toBe("TypeScript Language");
      expect(annotation.item_id).toBeDefined();
    });

    it("should handle multiple links with correct indices", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Visit [Google](https://google.com) and [GitHub](https://github.com)." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const annotationEvents = events.filter(e => e.type === "response.output_text.annotation.added");
      expect(annotationEvents.length).toBe(2);
      
      // First link
      expect(annotationEvents[0].annotation.url).toBe("https://google.com");
      expect(annotationEvents[0].annotation_index).toBe(0);
      
      // Second link
      expect(annotationEvents[1].annotation.url).toBe("https://github.com");
      expect(annotationEvents[1].annotation_index).toBe(1);
    });

    it("should use link text as title when no title provided", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "See [Example Site](https://example.com) for details." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const annotationEvent = events.find(e => e.type === "response.output_text.annotation.added");
      expect(annotationEvent?.annotation.title).toBe("Example Site");
    });
  });

  describe("mixed content", () => {
    it("should handle text with markdown elements", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Here's some code:\n\n" },
        { type: "text", text: "```javascript\nconsole.log('test');\n```\n\n" },
        { type: "text", text: "And a quote:\n> Important note" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have text deltas
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
      
      // Should have code interpreter item
      const codeItem = events.find(e => 
        e.type === "response.output_item.done" && 
        e.item.type === "code_interpreter_call"
      );
      expect(codeItem).toBeDefined();
      
      // Should NOT have reasoning items for quotes (they're just text)
      const reasoningItems = events.filter(e => 
        (e.type === "response.output_item.added" || e.type === "response.output_item.done") && 
        e.item.type === "reasoning"
      );
      expect(reasoningItems.length).toBe(0);
    });
  });

  describe("sequence numbers", () => {
    it("should have incrementing sequence numbers", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Hello" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Check that sequence numbers are incrementing
      for (let i = 1; i < events.length; i++) {
        expect(events[i].sequence_number).toBeGreaterThan(events[i - 1].sequence_number);
      }
    });
  });

  describe("output indices", () => {
    it("should assign proper output indices to items", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "# Header\n```js\ncode\n```" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const itemAddedEvents = events.filter(e => e.type === "response.output_item.added");
      
      // Should have unique output indices
      const outputIndices = itemAddedEvents.map(e => e.output_index);
      const uniqueIndices = [...new Set(outputIndices)];
      expect(uniqueIndices.length).toBe(outputIndices.length);
    });
  });

  describe("reset functionality", () => {
    it("should reset handler state properly", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Test" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      await collectEvents(parts);
      handler.reset();
      
      // Should be able to handle new stream after reset
      const newEvents = await collectEvents(parts);
      expect(newEvents.length).toBeGreaterThan(0);
      expect(newEvents[0].type).toBe("response.created");
    });
  });

  describe("paragraph splitting", () => {
    it("should split text by \\n\\n into separate deltas", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBe(3); // Three paragraphs
      
      expect(textDeltas[0].delta).toBe("First paragraph.\n\n");
      expect(textDeltas[1].delta).toBe("Second paragraph.\n\n");
      expect(textDeltas[2].delta).toBe("Third paragraph.");
    });

    it("should handle multiple consecutive \\n\\n correctly", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "First.\n\n\n\nSecond.\n\n\n\n\n\nThird." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      
      // Each \n\n should create a separate delta
      expect(textDeltas[0].delta).toBe("First.\n\n");
      expect(textDeltas[1].delta).toBe("\n\n");
      expect(textDeltas[2].delta).toBe("Second.\n\n");
      expect(textDeltas[3].delta).toBe("\n\n");
      expect(textDeltas[4].delta).toBe("\n\n");
      expect(textDeltas[5].delta).toBe("Third.");
    });

    it("should not split code blocks by \\n\\n", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Text before.\n\n```python\ndef hello():\n\n    print('world')\n```\n\nText after." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      
      // Should emit text blocks separately but preserve code block
      let hasCodeBlockWithDoubleNewline = false;
      for (const delta of textDeltas) {
        if (delta.delta.includes("def hello():\n\n    print('world')")) {
          hasCodeBlockWithDoubleNewline = true;
        }
      }
      expect(hasCodeBlockWithDoubleNewline).toBe(true);
    });

    it("should handle incomplete paragraphs across chunks", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "First paragraph.\n" },
        { type: "text", text: "\nSecond paragraph." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBe(2);
      
      expect(textDeltas[0].delta).toBe("First paragraph.\n\n");
      expect(textDeltas[1].delta).toBe("Second paragraph.");
    });
  });

  describe("event ordering", () => {
    it("should maintain correct sequence for output items", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "# Header\n```js\ncode\n```" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      
      // Group output item events by item id
      const itemEvents = new Map<string, ResponseStreamEvent[]>();
      events.forEach(event => {
        if (event.type === "response.output_item.added" || event.type === "response.output_item.done") {
          const itemId = event.item.id;
          const existingEvents = itemEvents.get(itemId) || [];
          existingEvents.push(event);
          itemEvents.set(itemId, existingEvents);
        }
      });

      // Each item should have exactly one "added" followed by one "done"
      itemEvents.forEach((events, itemId) => {
        expect(events.length).toBe(2);
        expect(events[0].type).toBe("response.output_item.added");
        expect(events[1].type).toBe("response.output_item.done");
        expect(events[0].sequence_number).toBeLessThan(events[1].sequence_number);
      });
    });

    it("should have matching pairs of output_item.added and output_item.done", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Some text here.\n\n```python\ndef hello():\n    print('world')\n```\n\nMore text.\n\n```javascript\nconsole.log('test');\n```" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const addedEvents = events.filter(e => e.type === "response.output_item.added");
      const doneEvents = events.filter(e => e.type === "response.output_item.done");
      
      // Should have same number of added and done events
      expect(addedEvents.length).toBe(doneEvents.length);
      
      // Each added should have a corresponding done with same item id
      addedEvents.forEach(added => {
        const correspondingDone = doneEvents.find(done => done.item.id === added.item.id);
        expect(correspondingDone).toBeDefined();
        expect(correspondingDone.item.type).toBe(added.item.type);
      });
    });

    it("should treat tables as regular text", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "| Col1 | Col2 |\n| Data1 | Data2 |" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Tables should be treated as regular text, not special items
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
      
      const reasoningItems = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "reasoning"
      );
      
      // Should have NO reasoning items for tables
      expect(reasoningItems.length).toBe(0);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toContain("Col1");
      expect(textDone?.text).toContain("Data1");
    });

    it("should balance text deltas vs structured content", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Plain text " },
        { type: "text", text: "```js\nconsole.log('test');\n```\n" },
        { type: "text", text: "More plain text" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      const codeItems = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "code_interpreter_call"
      );
      
      // Should have text deltas for plain text parts
      expect(textDeltas.length).toBeGreaterThan(0);
      // Should have one code interpreter item for code block
      expect(codeItems.length).toBe(1);
      
      // Check that plain text appears in deltas
      const allDeltaText = textDeltas.map(e => e.delta).join('');
      expect(allDeltaText).toContain("Plain text");
      expect(allDeltaText).toContain("More plain text");
    });
  });
});