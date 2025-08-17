import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "fs/promises";
import path from "path";
import type { ResponseStreamEvent } from "../../openai-generic/responses-adapter/types";
import type { StreamedPart } from "../client/fetch-client";
import { GeminiStreamHandler } from "./stream-handler";
import { createGeminiMarkdownParser, processMarkdownChunk, completeMarkdownParsing } from "./markdown-parser";

const MARKDOWN_SAMPLES_DIR = path.join(__dirname, "__mocks__", "markdown-samples");

describe("Integration Tests - Markdown Parser & Stream Handler", () => {
  async function processMarkdownFile(
    filePath: string,
    chunkSize: number = 100
  ): Promise<{
    events: ResponseStreamEvent[];
    markdownEvents: any[];
    content: string;
  }> {
    const content = await readFile(filePath, "utf-8");
    const handler = new GeminiStreamHandler();
    const parser = createGeminiMarkdownParser();
    
    // Collect stream handler events
    const events: ResponseStreamEvent[] = [];
    const parts: StreamedPart[] = [];
    
    // Create chunks
    for (let i = 0; i < content.length; i += chunkSize) {
      parts.push({ type: "text", text: content.slice(i, i + chunkSize) });
    }
    parts.push({ type: "complete", finishReason: "STOP" });
    
    // Process with stream handler
    async function* mockStream() {
      for (const part of parts) {
        yield part;
      }
    }
    
    for await (const event of handler.handleStream(mockStream())) {
      events.push(event);
    }
    
    // Also collect markdown parser events
    const markdownEvents: any[] = [];
    for await (const event of processMarkdownChunk(parser, content)) {
      markdownEvents.push(event);
    }
    for await (const event of completeMarkdownParsing(parser)) {
      markdownEvents.push(event);
    }
    
    return { events, markdownEvents, content };
  }

  describe("markdown parsing coordination", () => {
    it("should handle all sample files consistently", async () => {
      const files = await readdir(MARKDOWN_SAMPLES_DIR);
      const markdownFiles = files.filter(f => f.endsWith(".md"));
      
      for (const file of markdownFiles) {
        console.log(`\nProcessing ${file}...`);
        const filePath = path.join(MARKDOWN_SAMPLES_DIR, file);
        
        // Test with multiple chunk sizes
        for (const chunkSize of [50, 200]) {
          const { events, markdownEvents, content } = await processMarkdownFile(filePath, chunkSize);
          
          // Basic validations
          expect(events[0].type).toBe("response.created");
          expect(events[events.length - 1].type).toBe("response.completed");
          
          // Reconstruct content
          const textDeltas = events.filter(e => e.type === "response.output_text.delta");
          const reconstructed = textDeltas.map(e => e.delta).join("");
          expect(reconstructed).toBe(content);
          
          // Log markdown elements found
          const elementTypes = new Set(
            markdownEvents
              .filter(e => e.type === "begin")
              .map(e => e.elementType)
          );
          
          if (elementTypes.size > 0) {
            console.log(`  Markdown elements: ${Array.from(elementTypes).join(", ")}`);
          }
          
          // Verify \n\n splitting behavior
          const paragraphCount = (content.match(/\n\n/g) || []).length;
          const deltaCount = textDeltas.length;
          
          console.log(`  Chunk size ${chunkSize}: ${paragraphCount} paragraph breaks, ${deltaCount} deltas`);
          
          // Deltas should be related to paragraph breaks (but not necessarily 1:1)
          if (paragraphCount > 0) {
            expect(deltaCount).toBeGreaterThan(0);
          }
        }
      }
    });

    it("should preserve code block integrity across parsing layers", async () => {
      const codeBlockFile = path.join(MARKDOWN_SAMPLES_DIR, "code-blocks.md");
      const { events, markdownEvents, content } = await processMarkdownFile(codeBlockFile, 30);
      
      // Count code blocks in markdown parser
      const codeBlocksInParser = markdownEvents.filter(
        e => e.type === "begin" && e.elementType === "code"
      ).length;
      
      console.log(`Found ${codeBlocksInParser} code blocks in parser`);
      
      // Verify code blocks are preserved in stream output
      const textDone = events.find(e => e.type === "response.output_text.done");
      const codeBlockMatches = (textDone?.text.match(/```/g) || []).length;
      
      // Should have even number of ``` (opening and closing)
      expect(codeBlockMatches % 2).toBe(0);
      expect(codeBlockMatches / 2).toBe(codeBlocksInParser);
      
      // Verify \n\n inside code blocks are preserved
      expect(textDone?.text).toContain("# This has double newlines inside");
      // Check for proper newline preservation in code blocks
      expect(textDone?.text).toMatch(/print\("Hello, World!"\)\s+# This has double newlines inside\s+return True/);
    });

    it("should handle streaming boundaries correctly", async () => {
      // Test specific boundary cases
      const testCases = [
        {
          name: "\\n\\n at chunk boundary",
          chunks: ["Para1\n", "\nPara2"],
          expectedDeltas: 2
        },
        {
          name: "``` at chunk boundary",
          chunks: ["Text `", "``python\ncode\n``", "`\nMore"],
          expectedDeltas: 1 // Code block doesn't trigger paragraph split
        },
        {
          name: "Multiple \\n\\n in single chunk",
          chunks: ["A\n\n\n\nB\n\nC"],
          expectedDeltas: 4 // "A\n\n", "\n\n", "B\n\n", "C"
        }
      ];
      
      for (const testCase of testCases) {
        console.log(`\nTesting: ${testCase.name}`);
        const handler = new GeminiStreamHandler();
        const events: ResponseStreamEvent[] = [];
        
        const parts: StreamedPart[] = testCase.chunks.map(chunk => ({ type: "text", text: chunk }));
        parts.push({ type: "complete", finishReason: "STOP" });
        
        async function* mockStream() {
          for (const part of parts) {
            yield part;
          }
        }
        
        for await (const event of handler.handleStream(mockStream())) {
          events.push(event);
        }
        
        const textDeltas = events.filter(e => e.type === "response.output_text.delta");
        console.log(`  Expected ${testCase.expectedDeltas} deltas, got ${textDeltas.length}`);
        console.log(`  Deltas:`, textDeltas.map(d => JSON.stringify(d.delta)));
        
        expect(textDeltas.length).toBe(testCase.expectedDeltas);
      }
    });
  });

  describe("real-world scenarios", () => {
    it("should handle ChatGPT-style responses", async () => {
      const chatGPTStyle = `I'll help you implement a binary search algorithm. Here's a comprehensive solution:

## Binary Search Implementation

Binary search is an efficient algorithm for finding an item in a sorted list. It works by repeatedly dividing the search interval in half.

\`\`\`python
def binary_search(arr, target):
    """
    Performs binary search on a sorted array.
    
    Args:
        arr: A sorted list of comparable items
        target: The item to search for
    
    Returns:
        The index of the target if found, -1 otherwise
    """
    left = 0
    right = len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1


# Example usage
if __name__ == "__main__":
    # Test array
    numbers = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    
    # Test cases
    test_values = [7, 1, 19, 4, 20]
    
    for value in test_values:
        result = binary_search(numbers, value)
        if result != -1:
            print(f"Found {value} at index {result}")
        else:
            print(f"{value} not found in the array")
\`\`\`

## Time Complexity

- **Best Case**: O(1) - When the target is at the middle
- **Average Case**: O(log n) - Typical case
- **Worst Case**: O(log n) - When target is at either end or not present

## Space Complexity

- **Iterative**: O(1) - Only uses a few variables
- **Recursive**: O(log n) - Due to the call stack

Would you like me to show you the recursive version as well?`;
      
      const handler = new GeminiStreamHandler();
      const parts: StreamedPart[] = [];
      
      // Simulate streaming in realistic chunks
      const chunkSize = 150;
      for (let i = 0; i < chatGPTStyle.length; i += chunkSize) {
        parts.push({ type: "text", text: chatGPTStyle.slice(i, i + chunkSize) });
      }
      parts.push({ type: "complete", finishReason: "STOP" });
      
      const events: ResponseStreamEvent[] = [];
      async function* mockStream() {
        for (const part of parts) {
          yield part;
        }
      }
      
      for await (const event of handler.handleStream(mockStream())) {
        events.push(event);
      }
      
      // Verify proper handling
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      const reconstructed = textDeltas.map(e => e.delta).join("");
      
      expect(reconstructed).toBe(chatGPTStyle);
      
      // Should have multiple deltas due to paragraph breaks
      expect(textDeltas.length).toBeGreaterThan(5);
      
      // Verify code block is preserved
      expect(reconstructed).toContain("def binary_search(arr, target):");
      expect(reconstructed).toMatch(/while left <= right:\s+mid = \(left \+ right\) \/\/ 2/);
    });

    it("should handle mixed content with function calls", async () => {
      const handler = new GeminiStreamHandler();
      const parts: StreamedPart[] = [
        { type: "text", text: "Let me search for that information.\n\n" },
        { type: "functionCall", functionCall: { 
          name: "web_search", 
          args: { query: "latest TypeScript features 2024" } 
        }},
        { type: "text", text: "Based on my search, here are the latest TypeScript features:\n\n" },
        { type: "text", text: "## TypeScript 5.3 Features\n\n" },
        { type: "text", text: "1. **Import Attributes**: Support for import assertions\n" },
        { type: "text", text: "2. **`const` Type Parameters**: More precise type inference\n\n" },
        { type: "functionCall", functionCall: { 
          name: "get_code_example", 
          args: { feature: "const-type-parameters" } 
        }},
        { type: "text", text: "Here's an example:\n\n```typescript\nfunction identity<const T>(x: T): T {\n    return x;\n}\n```\n\n" },
        { type: "text", text: "This provides better type narrowing." },
        { type: "complete", finishReason: "STOP" }
      ];
      
      const events: ResponseStreamEvent[] = [];
      async function* mockStream() {
        for (const part of parts) {
          yield part;
        }
      }
      
      for await (const event of handler.handleStream(mockStream())) {
        events.push(event);
      }
      
      // Should have one text item and two function items
      const textItems = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "message"
      );
      const functionItems = events.filter(e => 
        e.type === "response.output_item.added" && 
        e.item.type === "function_call"
      );
      
      expect(textItems.length).toBe(1);
      expect(functionItems.length).toBe(2);
      
      // Verify function calls
      if (functionItems[0].item.type === "function_call") {
        expect(functionItems[0].item.name).toBe("web_search");
      }
      if (functionItems[1].item.type === "function_call") {
        expect(functionItems[1].item.name).toBe("get_code_example");
      }
      
      // Verify text is properly combined
      const textDone = events.find(e => e.type === "response.output_text.done");
      expect(textDone?.text).toContain("Let me search");
      expect(textDone?.text).toContain("TypeScript 5.3 Features");
      expect(textDone?.text).toContain("```typescript");
    });
  });

  describe("stress tests", () => {
    it("should handle rapid small chunks", async () => {
      const content = "A\n\nB\n\nC\n\nD\n\nE";
      const handler = new GeminiStreamHandler();
      
      // Create one character chunks
      const parts: StreamedPart[] = content
        .split("")
        .map(char => ({ type: "text" as const, text: char }));
      parts.push({ type: "complete", finishReason: "STOP" });
      
      const events: ResponseStreamEvent[] = [];
      async function* mockStream() {
        for (const part of parts) {
          yield part;
        }
      }
      
      for await (const event of handler.handleStream(mockStream())) {
        events.push(event);
      }
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBe(5); // A, B, C, D, E
      
      const reconstructed = textDeltas.map(e => e.delta).join("");
      expect(reconstructed).toBe(content);
    });

    it("should handle extremely long lines", async () => {
      const longLine = "x".repeat(10000);
      const content = `Short.\n\n${longLine}\n\nShort again.`;
      
      const handler = new GeminiStreamHandler();
      const parts = [
        { type: "text" as const, text: content },
        { type: "complete" as const, finishReason: "STOP" as const }
      ];
      
      const events: ResponseStreamEvent[] = [];
      async function* mockStream() {
        for (const part of parts) {
          yield part;
        }
      }
      
      for await (const event of handler.handleStream(mockStream())) {
        events.push(event);
      }
      
      const textDeltas = events.filter(e => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBe(3);
      
      // Verify long line is preserved
      expect(textDeltas[1].delta).toContain(longLine);
    });
  });
});