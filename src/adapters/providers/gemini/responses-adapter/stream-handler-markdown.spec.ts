import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "fs/promises";
import path from "path";
import type { ResponseStreamEvent } from "../../openai-generic/responses-adapter/types";
import type { StreamedPart } from "../client/fetch-client";
import { GeminiStreamHandler } from "./stream-handler";

const MARKDOWN_SAMPLES_DIR = path.join(__dirname, "__mocks__", "markdown-samples");

// Helper to convert markdown content to streaming parts
function createStreamParts(content: string, chunkSize: number = 100): StreamedPart[] {
  const parts: StreamedPart[] = [];
  
  // Split content into chunks to simulate streaming
  for (let i = 0; i < content.length; i += chunkSize) {
    parts.push({
      type: "text",
      text: content.slice(i, i + chunkSize),
    });
  }
  
  // Add completion
  parts.push({ type: "complete", finishReason: "STOP" });
  
  return parts;
}

// Helper to collect all events from stream
async function collectEvents(handler: GeminiStreamHandler, parts: StreamedPart[]): Promise<ResponseStreamEvent[]> {
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

// Analyze events for common patterns
function analyzeEvents(events: ResponseStreamEvent[]) {
  const analysis = {
    totalEvents: events.length,
    eventTypes: {} as Record<string, number>,
    textDeltas: [] as string[],
    hasValidSequence: true,
    outputItems: [] as Array<{ type: string; id: string }>,
    errors: [] as string[],
  };

  // Count event types
  for (const event of events) {
    analysis.eventTypes[event.type] = (analysis.eventTypes[event.type] || 0) + 1;
    
    // Collect text deltas
    if (event.type === "response.output_text.delta") {
      analysis.textDeltas.push(event.delta);
    }
    
    // Track output items
    if (event.type === "response.output_item.added") {
      analysis.outputItems.push({ type: event.item.type, id: event.item.id || "" });
    }
  }

  // Validate event sequence
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  
  if (firstEvent?.type !== "response.created") {
    analysis.hasValidSequence = false;
    analysis.errors.push("First event should be response.created");
  }
  
  if (lastEvent?.type !== "response.completed") {
    analysis.hasValidSequence = false;
    analysis.errors.push("Last event should be response.completed");
  }

  // Check for matching added/done pairs
  const addedCount = analysis.eventTypes["response.output_item.added"] || 0;
  const doneCount = analysis.eventTypes["response.output_item.done"] || 0;
  
  if (addedCount !== doneCount) {
    analysis.errors.push(`Mismatched added/done pairs: ${addedCount} added, ${doneCount} done`);
  }

  return analysis;
}

describe("GeminiStreamHandler - Markdown Files", () => {
  it("should process all markdown sample files correctly", async () => {
    const files = await readdir(MARKDOWN_SAMPLES_DIR);
    const markdownFiles = files.filter(f => f.endsWith(".md"));
    
    expect(markdownFiles.length).toBeGreaterThan(0);
    
    for (const file of markdownFiles) {
      console.log(`\n=== Testing ${file} ===`);
      
      const content = await readFile(path.join(MARKDOWN_SAMPLES_DIR, file), "utf-8");
      const handler = new GeminiStreamHandler();
      
      // Test with different chunk sizes
      for (const chunkSize of [50, 100, 500]) {
        const parts = createStreamParts(content, chunkSize);
        const events = await collectEvents(handler, parts);
        const analysis = analyzeEvents(events);
        
        // Basic validations
        expect(analysis.hasValidSequence).toBe(true);
        expect(analysis.errors).toHaveLength(0);
        
        // Log analysis for debugging
        console.log(`  Chunk size ${chunkSize}:`);
        console.log(`    Total events: ${analysis.totalEvents}`);
        console.log(`    Event types:`, analysis.eventTypes);
        console.log(`    Text deltas: ${analysis.textDeltas.length}`);
        console.log(`    Output items: ${analysis.outputItems.length}`);
        
        // Reconstruct text from deltas
        const reconstructedText = analysis.textDeltas.join("");
        expect(reconstructedText).toBe(content);
        
        // Reset handler for next test
        handler.reset();
      }
    }
  });

  describe("specific markdown patterns", () => {
    it("should handle simple text with paragraph breaks", async () => {
      const content = await readFile(path.join(MARKDOWN_SAMPLES_DIR, "simple-text.md"), "utf-8");
      const handler = new GeminiStreamHandler();
      const parts = createStreamParts(content, 100);
      const events = await collectEvents(handler, parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      
      // Should split on \n\n
      expect(textDeltas.length).toBe(3);
      expect(textDeltas[0].delta).toContain("This is a simple text");
      expect(textDeltas[1].delta).toContain("It contains multiple paragraphs");
      expect(textDeltas[2].delta).toContain("This is the third paragraph");
    });

    it("should preserve code blocks without splitting", async () => {
      const content = await readFile(path.join(MARKDOWN_SAMPLES_DIR, "code-blocks.md"), "utf-8");
      const handler = new GeminiStreamHandler();
      const parts = createStreamParts(content, 50);
      const events = await collectEvents(handler, parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      
      // Find deltas containing code
      const pythonCodeDelta = textDeltas.find(d => d.delta.includes("def hello_world():"));
      const jsCodeDelta = textDeltas.find(d => d.delta.includes("function greet(name)"));
      
      expect(pythonCodeDelta).toBeDefined();
      expect(jsCodeDelta).toBeDefined();
      
      // Code blocks should preserve internal newlines
      expect(pythonCodeDelta!.delta).toContain("# This has double newlines inside");
      expect(jsCodeDelta!.delta).toContain("// Multiple newlines here too");
    });

    it("should handle mixed content correctly", async () => {
      const content = await readFile(path.join(MARKDOWN_SAMPLES_DIR, "mixed-content.md"), "utf-8");
      const handler = new GeminiStreamHandler();
      const parts = createStreamParts(content, 200);
      const events = await collectEvents(handler, parts);
      
      const analysis = analyzeEvents(events);
      
      // Should have valid event sequence
      expect(analysis.hasValidSequence).toBe(true);
      expect(analysis.errors).toHaveLength(0);
      
      // Verify text reconstruction
      const reconstructedText = analysis.textDeltas.join("");
      expect(reconstructedText).toBe(content);
    });

    it("should handle edge cases", async () => {
      const content = await readFile(path.join(MARKDOWN_SAMPLES_DIR, "edge-cases.md"), "utf-8");
      const handler = new GeminiStreamHandler();
      const parts = createStreamParts(content, 30); // Small chunks for edge case testing
      const events = await collectEvents(handler, parts);
      
      const analysis = analyzeEvents(events);
      
      // Should handle edge cases without errors
      expect(analysis.hasValidSequence).toBe(true);
      expect(analysis.errors).toHaveLength(0);
    });

    it("should handle cross-validation example correctly", async () => {
      const content = await readFile(path.join(MARKDOWN_SAMPLES_DIR, "cross-validation-example.md"), "utf-8");
      const handler = new GeminiStreamHandler();
      
      // Simulate the exact chunking from the user's example
      const parts: StreamedPart[] = [
        { 
          type: "text", 
          text: content.substring(0, content.indexOf('print(f"\\nCross-Validation'))
        },
        { 
          type: "text", 
          text: content.substring(content.indexOf('print(f"\\nCross-Validation'))
        },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(handler, parts);
      const analysis = analyzeEvents(events);
      
      // Should process without errors
      expect(analysis.hasValidSequence).toBe(true);
      expect(analysis.errors).toHaveLength(0);
      
      // Should have proper added/done pairs
      expect(analysis.eventTypes["response.output_item.added"]).toBe(analysis.eventTypes["response.output_item.done"]);
    });
  });

  describe("streaming behavior", () => {
    it("should handle single character chunks", async () => {
      const content = "Hello\n\nWorld";
      const handler = new GeminiStreamHandler();
      const parts = createStreamParts(content, 1); // One character at a time
      const events = await collectEvents(handler, parts);
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      
      // Should still split correctly
      expect(textDeltas.length).toBe(2);
      expect(textDeltas[0].delta).toBe("Hello\n\n");
      expect(textDeltas[1].delta).toBe("World");
    });

    it("should handle chunks that split at \\n\\n boundary", async () => {
      const content = "First paragraph.\n\nSecond paragraph.";
      const handler = new GeminiStreamHandler();
      
      // Split exactly at \n\n
      const parts: StreamedPart[] = [
        { type: "text", text: "First paragraph.\n" },
        { type: "text", text: "\nSecond paragraph." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events = await collectEvents(handler, parts);
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      
      expect(textDeltas.length).toBe(2);
      expect(textDeltas[0].delta).toBe("First paragraph.\n\n");
      expect(textDeltas[1].delta).toBe("Second paragraph.");
    });
  });
});