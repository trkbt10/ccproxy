import { describe, it, expect } from "bun:test";
import {
  extractTextFromContent,
  normalizeInputItems,
  mapTools,
  mapToolChoice,
  textFromMessages,
  generateId,
} from "./utils";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

describe("Grok Utils", () => {
  describe("extractTextFromContent", () => {
    it("should return string content as-is", () => {
      expect(extractTextFromContent("hello world")).toBe("hello world");
    });

    it("should extract text from input_text content array", () => {
      const content = [
        { type: "input_text", text: "Hello" },
        { type: "input_text", text: " World" },
      ];
      expect(extractTextFromContent(content)).toBe("Hello World");
    });

    it("should filter out non-input_text items", () => {
      const content = [
        { type: "input_text", text: "Hello" },
        { type: "image", url: "http://example.com" },
        { type: "input_text", text: " World" },
      ];
      expect(extractTextFromContent(content)).toBe("Hello World");
    });

    it("should return empty string for non-string/non-array content", () => {
      expect(extractTextFromContent(null)).toBe("");
      expect(extractTextFromContent(undefined)).toBe("");
      expect(extractTextFromContent(123)).toBe("");
      expect(extractTextFromContent({})).toBe("");
    });
  });

  describe("normalizeInputItems", () => {
    it("should convert string input to message array", () => {
      const result = normalizeInputItems("Hello");
      expect(result).toEqual([
        { role: "user", content: "Hello", type: "message" },
      ]);
    });

    it("should return array input as-is", () => {
      const input = [{ role: "user", content: "Test" }];
      expect(normalizeInputItems(input)).toBe(input);
    });

    it("should return empty array for invalid input", () => {
      expect(normalizeInputItems(null)).toEqual([]);
      expect(normalizeInputItems(undefined)).toEqual([]);
      expect(normalizeInputItems(123)).toEqual([]);
    });
  });

  describe("mapTools", () => {
    it("should map function tools correctly", () => {
      const tools = [
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "A test tool",
            parameters: { type: "object", properties: { input: { type: "string" } } },
          },
        },
      ];
      const result = mapTools(tools);
      expect(result).toEqual([
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "A test tool",
            parameters: { type: "object", properties: { input: { type: "string" } } },
          },
        },
      ]);
    });

    it("should provide default parameters if missing", () => {
      const tools = [
        {
          type: "function",
          function: {
            name: "test_tool",
          },
        },
      ];
      const result = mapTools(tools);
      expect(result?.[0]?.function.parameters).toEqual({ type: "object", properties: {} });
    });

    it("should filter out non-function tools", () => {
      const tools = [
        { type: "other", function: { name: "test" } },
        {
          type: "function",
          function: { name: "valid_tool" },
        },
      ];
      const result = mapTools(tools);
      expect(result?.length).toBe(1);
      expect(result?.[0]?.function.name).toBe("valid_tool");
    });

    it("should return undefined for non-array tools", () => {
      expect(mapTools(null)).toBeUndefined();
      expect(mapTools(undefined)).toBeUndefined();
      expect(mapTools("tools")).toBeUndefined();
    });
  });

  describe("mapToolChoice", () => {
    it("should return 'required' as-is", () => {
      expect(mapToolChoice("required")).toBe("required");
    });

    it("should map function tool choice correctly", () => {
      const toolChoice = {
        type: "function",
        function: { name: "my_tool" },
      };
      expect(mapToolChoice(toolChoice)).toEqual({
        type: "function",
        function: { name: "my_tool" },
      });
    });

    it("should return undefined for invalid tool choices", () => {
      expect(mapToolChoice(null)).toBeUndefined();
      expect(mapToolChoice("auto")).toBeUndefined();
      expect(mapToolChoice({ type: "other" })).toBeUndefined();
      expect(mapToolChoice({ type: "function", function: {} })).toBeUndefined();
    });
  });

  describe("textFromMessages", () => {
    it("should extract text from last user message", () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "First message" },
        { role: "assistant", content: "Response" },
        { role: "user", content: "Second message" },
      ];
      expect(textFromMessages(messages)).toBe("Second message");
    });

    it("should return 'Hello' if no user message found", () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: "System prompt" },
        { role: "assistant", content: "Response" },
      ];
      expect(textFromMessages(messages)).toBe("Hello");
    });

    it("should handle non-string content", () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: "user", content: [{ type: "text", text: "Array content" }] },
      ];
      expect(textFromMessages(messages)).toBe("Hello");
    });
  });

  describe("generateId", () => {
    it("should generate unique IDs with prefix", () => {
      const id1 = generateId("test");
      const id2 = generateId("test");
      
      expect(id1).toMatch(/^test_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^test_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("should include timestamp in ID", () => {
      const before = Date.now();
      const id = generateId("prefix");
      const after = Date.now();
      
      const match = id.match(/^prefix_(\d+)_/);
      expect(match).toBeTruthy();
      
      const timestamp = parseInt(match![1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});