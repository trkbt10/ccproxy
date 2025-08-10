import { describe, test, expect, beforeEach, mock } from "bun:test";
import type {
  TextBlock,
  ImageBlockParam,
  ToolResultBlockParam,
  MessageParam,
  Base64ImageSource,
  URLImageSource,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem,
  ResponseInputText,
  ResponseInputItem,
  EasyInputMessage,
  ResponseInputImage,
} from "openai/resources/responses/responses";
import { convertClaudeImageToOpenAI } from "./message-converter/claude-to-openai/image";
import { convertToolResult } from "./message-converter/claude-to-openai/tool";
import { convertClaudeMessage } from "./message-converter/claude-to-openai/message";

describe("claude-to-openai converter", () => {
  beforeEach(() => {
    // Clear console mocks before each test
    mock.restore();
  });

  describe("convertClaudeImageToOpenAI", () => {
    test("converts base64 image source correctly", () => {
      const claudeImage: ImageBlockParam = {
        type: "image",
        source: {
          type: "base64",
          data: "aGVsbG8gd29ybGQ=",
          media_type: "image/jpeg",
        } as Base64ImageSource,
      };

      const result = convertClaudeImageToOpenAI(claudeImage);

      expect(result).toEqual({
        type: "input_image",
        image_url: "data:image/jpeg;base64,aGVsbG8gd29ybGQ=",
        detail: "auto",
      });
    });

    test("converts URL image source correctly", () => {
      const claudeImage: ImageBlockParam = {
        type: "image",
        source: {
          type: "url",
          url: "https://example.com/image.jpg",
        } as URLImageSource,
      };

      const result = convertClaudeImageToOpenAI(claudeImage);

      expect(result).toEqual({
        type: "input_image",
        image_url: "https://example.com/image.jpg",
        detail: "auto",
      });
    });

    test("throws error for unsupported image source", () => {
      const claudeImage: ImageBlockParam = {
        type: "image",
        source: { type: "unsupported" } as unknown as Base64ImageSource,
      };

      expect(() => convertClaudeImageToOpenAI(claudeImage)).toThrow(
        "Unsupported image source"
      );
    });
  });

  describe("convertToolResult", () => {
    test("converts tool result with string content", () => {
      const toolResult: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: "tool_123",
        content: "Result string",
      };

      const callIdMapping = new Map([["call_456", "tool_123"]]);

      const result = convertToolResult(toolResult, callIdMapping);

      expect(result).toEqual({
        id: "tool_123",
        type: "function_call_output",
        call_id: "call_456",
        output: "Result string",
      });
    });

    test("converts tool result with object content", () => {
      const toolResult: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: "tool_789",
        content: [
          {
            type: "text",
            text: "Complex result",
          },
        ],
      };

      const callIdMapping = new Map([["call_999", "tool_789"]]);

      const result = convertToolResult(toolResult, callIdMapping);

      expect(result).toEqual({
        id: "tool_789",
        type: "function_call_output",
        call_id: "call_999",
        output: JSON.stringify([
          {
            type: "text",
            text: "Complex result",
          },
        ]),
      });
    });

    test("uses tool_use_id as fallback when no mapping exists", () => {
      const toolResult: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: "tool_no_mapping",
        content: "Result",
      };

      const result = convertToolResult(toolResult);

      expect(result).toEqual({
        id: "tool_no_mapping",
        type: "function_call_output",
        call_id: "tool_no_mapping",
        output: "Result",
      });
    });

    test("handles empty mapping correctly", () => {
      const toolResult: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: "tool_empty",
        content: "Empty mapping result",
      };

      const callIdMapping = new Map();

      const result = convertToolResult(toolResult, callIdMapping);

      expect(result).toEqual({
        id: "tool_empty",
        type: "function_call_output",
        call_id: "tool_empty",
        output: "Empty mapping result",
      });
    });
  });

  describe("convertClaudeMessage", () => {
    test("converts simple string message", () => {
      const message: MessageParam = {
        role: "user",
        content: "Hello, world!",
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "user",
          content: "Hello, world!",
        },
      ]);
    });

    test("converts single text block message", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Single text block",
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "assistant",
          content: "Single text block",
        },
      ]);
    });

    test("buffers and combines multiple text blocks for assistant", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "First part. ",
          },
          {
            type: "text",
            text: "Second part. ",
          },
          {
            type: "text",
            text: "Third part.",
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "assistant",
          content: "First part. Second part. Third part.",
        },
      ]);
    });

    test("buffers and formats multiple text blocks for user", () => {
      const message: MessageParam = {
        role: "user",
        content: [
          {
            type: "text",
            text: "First user text",
          },
          {
            type: "text",
            text: "Second user text",
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "First user text",
            },
            {
              type: "input_text",
              text: "Second user text",
            },
          ],
        },
      ]);
    });

    test("handles tool_use blocks correctly", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Let me help you with that.",
          },
          {
            type: "tool_use",
            id: "tool_001",
            name: "calculator",
            input: { operation: "add", a: 5, b: 3 },
          },
        ],
      };

      const callIdMapping = new Map([["call_001", "tool_001"]]);

      const result = convertClaudeMessage(message, callIdMapping);

      expect(result).toEqual([
        {
          role: "assistant",
          content: "Let me help you with that.",
        },
        {
          type: "function_call",
          call_id: "call_001",
          name: "calculator",
          arguments: JSON.stringify({ operation: "add", a: 5, b: 3 }),
        },
      ]);
    });

    test("uses tool_use id as fallback when no mapping", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool_no_map",
            name: "weather",
            input: { location: "Tokyo" },
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          type: "function_call",
          call_id: "tool_no_map",
          name: "weather",
          arguments: JSON.stringify({ location: "Tokyo" }),
        },
      ]);
    });

    test("handles tool_result blocks correctly", () => {
      const message: MessageParam = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_002",
            content: "Weather is sunny",
          },
        ],
      };

      const callIdMapping = new Map([["call_002", "tool_002"]]);

      const result = convertClaudeMessage(message, callIdMapping);

      expect(result).toEqual([
        {
          id: "tool_002",
          type: "function_call_output",
          call_id: "call_002",
          output: "Weather is sunny",
        },
      ]);
    });

    test("handles image blocks correctly", () => {
      const message: MessageParam = {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: "https://example.com/image.png",
            } as URLImageSource,
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: "https://example.com/image.png",
              detail: "auto",
            },
          ],
        },
      ]);
    });

    test("handles mixed content with text, tool_use, and tool_result", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Starting analysis...",
          },
          {
            type: "tool_use",
            id: "tool_mixed_1",
            name: "analyze",
            input: { data: "test" },
          },
          {
            type: "text",
            text: "Processing results...",
          },
          {
            type: "tool_use",
            id: "tool_mixed_2",
            name: "summarize",
            input: { text: "summary" },
          },
        ],
      };

      const callIdMapping = new Map([
        ["call_mixed_1", "tool_mixed_1"],
        ["call_mixed_2", "tool_mixed_2"],
      ]);

      const result = convertClaudeMessage(message, callIdMapping);

      expect(result).toEqual([
        {
          role: "assistant",
          content: "Starting analysis...",
        },
        {
          type: "function_call",
          call_id: "call_mixed_1",
          name: "analyze",
          arguments: JSON.stringify({ data: "test" }),
        },
        {
          role: "assistant",
          content: "Processing results...",
        },
        {
          type: "function_call",
          call_id: "call_mixed_2",
          name: "summarize",
          arguments: JSON.stringify({ text: "summary" }),
        },
      ]);
    });

    test("flushes buffer correctly between different block types", () => {
      const message: MessageParam = {
        role: "user",
        content: [
          {
            type: "text",
            text: "First text",
          },
          {
            type: "text",
            text: "Second text",
          },
          {
            type: "image",
            source: {
              type: "url",
              url: "https://example.com/img.jpg",
            } as URLImageSource,
          },
          {
            type: "text",
            text: "Third text",
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "First text",
            },
            {
              type: "input_text",
              text: "Second text",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: "https://example.com/img.jpg",
              detail: "auto",
            },
          ],
        },
        {
          role: "user",
          content: "Third text",
        },
      ]);
    });

    test("handles empty content array", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([]);
    });

    test("handles text block with citations (ignored in conversion)", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Text with citations",
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toEqual([
        {
          role: "assistant",
          content: "Text with citations",
        },
      ]);
    });

    test("preserves role for all message types", () => {
      const userMessage: MessageParam = {
        role: "user",
        content: "User message",
      };

      const assistantMessage: MessageParam = {
        role: "assistant",
        content: "Assistant message",
      };

      const userResult = convertClaudeMessage(userMessage)[0];
      const assistantResult = convertClaudeMessage(assistantMessage)[0];

      // Check that the results are EasyInputMessage type with role property
      expect("role" in userResult && userResult.role).toBe("user");
      expect("role" in assistantResult && assistantResult.role).toBe("assistant");
    });
  });

  describe("buffer mechanism edge cases", () => {
    test("does not create empty messages when buffer is empty", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool_only",
            name: "test_tool",
            input: {},
          },
        ],
      };

      const result = convertClaudeMessage(message);

      // Should only have the tool call, no empty text message
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "function_call");
    });

    test("handles alternating text and tool blocks", () => {
      const message: MessageParam = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Text 1",
          },
          {
            type: "tool_use",
            id: "tool_1",
            name: "tool1",
            input: {},
          },
          {
            type: "text",
            text: "Text 2",
          },
          {
            type: "tool_use",
            id: "tool_2",
            name: "tool2",
            input: {},
          },
          {
            type: "text",
            text: "Text 3",
          },
        ],
      };

      const result = convertClaudeMessage(message);

      expect(result).toHaveLength(5);
      expect(result[0]).toHaveProperty("content", "Text 1");
      expect(result[1]).toHaveProperty("type", "function_call");
      expect(result[2]).toHaveProperty("content", "Text 2");
      expect(result[3]).toHaveProperty("type", "function_call");
      expect(result[4]).toHaveProperty("content", "Text 3");
    });
  });
});