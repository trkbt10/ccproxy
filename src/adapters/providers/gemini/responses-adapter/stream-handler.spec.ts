import { beforeEach, describe, expect, it } from "bun:test";
import type { 
  ResponseStreamEvent,
  ResponseCreatedEvent,
  ResponseCompletedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent
} from "openai/resources/responses/responses";
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
      const createdEvent = events[0] as ResponseCreatedEvent;
      expect(createdEvent.response).toBeDefined();
      expect(createdEvent.response.status).toBe("in_progress");
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
      const completed = completedEvent as ResponseCompletedEvent;
      expect(completed.response.status).toBe("completed");
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
        e.item.type === "message"
      );
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      const textDone = events.find(e => e.type === "response.output_text.done");
      const textItemDone = events.find(e => 
        e.type === "response.output_item.done" && 
        e.item.type === "message"
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
      if (textItemDone && textItemDone.type === "response.output_item.done" && textItemDone.item.type === "message") {
        const firstContent = textItemDone.item.content?.[0];
        if (firstContent?.type === "output_text") {
          expect(firstContent.text).toBe("Hello world!");
        }
      }
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
        e.item.type === "message"
      );
      expect(itemAddedEvents.length).toBe(1);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      // Without \n\n, all text is buffered and emitted as one delta at completion
      expect(textDeltas.length).toBe(1);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toBe("First chunk second chunk third chunk");
    });

    it("should emit separate deltas when text contains \\n\\n", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "First chunk\n\n" },
        { type: "text", text: "second chunk\n\n" },
        { type: "text", text: "third chunk" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      // Each \n\n triggers a delta emission
      expect(textDeltas.length).toBe(3);
      
      expect(textDeltas[0].delta).toBe("First chunk\n\n");
      expect(textDeltas[1].delta).toBe("second chunk\n\n");
      expect(textDeltas[2].delta).toBe("third chunk");
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
      
      // Code block content should be preserved in one delta
      const codeBlockDelta = textDeltas.find(d => d.delta.includes("def hello():"));
      expect(codeBlockDelta).toBeDefined();
      expect(codeBlockDelta!.delta).toContain("def hello():\n\n    print('world')");
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

  describe("function calls", () => {
    it("should emit function call events", async () => {
      const parts: StreamedPart[] = [
        { type: "functionCall", functionCall: { name: "test_function", args: { param: "value" } } },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const itemAdded = events.find((e): e is ResponseOutputItemAddedEvent => 
        e.type === "response.output_item.added"
      ) as ResponseOutputItemAddedEvent | undefined;
      expect(itemAdded).toBeDefined();
      
      const itemDone = events.find((e): e is ResponseOutputItemDoneEvent => 
        e.type === "response.output_item.done"
      ) as ResponseOutputItemDoneEvent | undefined;
      expect(itemDone).toBeDefined();
      if (itemDone && itemDone.item.type === "function_call") {
        expect(itemDone.item.name).toBe("test_function");
        expect(itemDone.item.arguments).toBe('{"param":"value"}');
      }
    });

    it("should handle function calls without args", async () => {
      const parts: StreamedPart[] = [
        { type: "functionCall", functionCall: { name: "no_args_function" } },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const itemAdded = events.find((e): e is ResponseOutputItemAddedEvent => 
        e.type === "response.output_item.added"
      ) as ResponseOutputItemAddedEvent | undefined;
      if (itemAdded && itemAdded.item.type === "function_call") {
        expect(itemAdded.item.arguments).toBe("{}");
      }
    });
  });

  describe("mixed content", () => {
    it("should handle text with function calls", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Here's some text.\n\n" },
        { type: "functionCall", functionCall: { name: "test_func", args: {} } },
        { type: "text", text: "And more text." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      // Should have one text item and one function item
      const textItems = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "message"
      );
      const functionItems = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "function_call"
      );
      
      expect(textItems.length).toBe(1);
      expect(functionItems.length).toBe(1);
      
      // Text should be combined
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toBe("Here's some text.\n\nAnd more text.");
    });
  });

  describe("edge cases", () => {
    it("should handle empty text parts", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "" },
        { type: "text", text: "actual content" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toBe("actual content");
    });

    it("should handle completion without content", async () => {
      const parts: StreamedPart[] = [
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(parts);
      
      expect(events[0].type).toBe("response.created");
      expect(events[1].type).toBe("response.completed");
    });

    it("should handle incomplete finish reason", async () => {
      const parts: StreamedPart[] = [
        { type: "text", text: "Partial response..." },
        { type: "complete", finishReason: "MAX_TOKENS" }
      ];
      
      const events = await collectEvents(parts);
      
      const completed = events.find(e => e.type === "response.completed");
      expect(completed?.response.status).toBe("incomplete");
      expect(completed?.response.incomplete_details?.reason).toBe("max_output_tokens");
    });
  });

  describe("state management", () => {
    it("should reset state properly", async () => {
      // First response
      const parts1: StreamedPart[] = [
        { type: "text", text: "First response" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      await collectEvents(parts1);
      
      // Reset
      handler.reset();
      
      // Second response
      const parts2: StreamedPart[] = [
        { type: "text", text: "Second response" },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events2 = await collectEvents(parts2);
      
      // Should have fresh IDs and sequence numbers
      expect(events2[0].type).toBe("response.created");
      expect(events2[0].sequence_number).toBe(1);
      
      const textDone = events2.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toBe("Second response");
    });
  });
});