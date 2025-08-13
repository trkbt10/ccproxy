import { describe, it, expect } from "bun:test";
import {
  isGrokChatCompletion,
  isObject,
  isEasyInputMessage,
  isResponseInputMessageItem,
  isFunctionTool,
  isFunctionToolChoice,
  ensureGrokStream,
} from "./guards";

describe("Grok Guards", () => {
  describe("isObject", () => {
    it("should return true for objects", () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: "value" })).toBe(true);
      expect(isObject([])).toBe(true);
    });

    it("should return false for non-objects", () => {
      expect(isObject(null)).toBe(false);
      expect(isObject(undefined)).toBe(false);
      expect(isObject("string")).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
    });
  });

  describe("isGrokChatCompletion", () => {
    it("should return true for valid GrokChatCompletion", () => {
      const valid = {
        id: "test-id",
        choices: [{ message: { role: "assistant", content: "Hello" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
      expect(isGrokChatCompletion(valid)).toBe(true);
    });

    it("should return true even with minimal valid structure", () => {
      const minimal = {
        choices: [{}],
      };
      expect(isGrokChatCompletion(minimal)).toBe(true);
    });

    it("should return false for invalid structures", () => {
      expect(isGrokChatCompletion(null)).toBe(false);
      expect(isGrokChatCompletion(undefined)).toBe(false);
      expect(isGrokChatCompletion("string")).toBe(false);
      expect(isGrokChatCompletion({})).toBe(false);
      expect(isGrokChatCompletion({ choices: null })).toBe(false);
      expect(isGrokChatCompletion({ choices: [] })).toBe(false);
      expect(isGrokChatCompletion({ choices: ["string"] })).toBe(false);
    });
  });

  describe("isEasyInputMessage", () => {
    it("should return true for valid EasyInputMessage", () => {
      const valid = {
        type: "message",
        role: "user",
        content: "Hello",
      };
      expect(isEasyInputMessage(valid)).toBe(true);
    });

    it("should return false for invalid structures", () => {
      expect(isEasyInputMessage(null)).toBe(false);
      expect(isEasyInputMessage({ type: "other", role: "user", content: "test" })).toBe(false);
      expect(isEasyInputMessage({ type: "message", role: 123, content: "test" })).toBe(false);
      expect(isEasyInputMessage({ type: "message", role: "user" })).toBe(false);
    });
  });

  describe("isResponseInputMessageItem", () => {
    it("should return true for valid ResponseInputMessageItem", () => {
      const valid = {
        type: "message",
        role: "assistant",
        content: "Response",
      };
      expect(isResponseInputMessageItem(valid)).toBe(true);
    });

    it("should behave the same as isEasyInputMessage", () => {
      const testCases = [
        { type: "message", role: "user", content: "test" },
        null,
        undefined,
        { type: "other", role: "user", content: "test" },
        { type: "message", role: "user" },
      ];

      testCases.forEach((testCase) => {
        expect(isResponseInputMessageItem(testCase)).toBe(isEasyInputMessage(testCase));
      });
    });
  });

  describe("isFunctionTool", () => {
    it("should return true for valid function tool", () => {
      const valid = {
        type: "function",
        function: {
          name: "my_tool",
          description: "A tool",
          parameters: { type: "object" },
        },
      };
      expect(isFunctionTool(valid)).toBe(true);
    });

    it("should require at least name in function", () => {
      const minimal = {
        type: "function",
        function: { name: "test" },
      };
      expect(isFunctionTool(minimal)).toBe(true);
    });

    it("should return false for invalid structures", () => {
      expect(isFunctionTool(null)).toBe(false);
      expect(isFunctionTool({ type: "other", function: { name: "test" } })).toBe(false);
      expect(isFunctionTool({ type: "function", function: null })).toBe(false);
      expect(isFunctionTool({ type: "function", function: {} })).toBe(false);
      expect(isFunctionTool({ type: "function", function: { name: 123 } })).toBe(false);
    });
  });

  describe("isFunctionToolChoice", () => {
    it("should return true for valid function tool choice", () => {
      const valid = {
        type: "function",
        function: { name: "my_tool" },
      };
      expect(isFunctionToolChoice(valid)).toBe(true);
    });

    it("should return false for non-function tool choices", () => {
      expect(isFunctionToolChoice(undefined)).toBe(false);
      expect(isFunctionToolChoice(null)).toBe(false);
      expect(isFunctionToolChoice("auto")).toBe(false);
      expect(isFunctionToolChoice({ type: "other" })).toBe(false);
      expect(isFunctionToolChoice({})).toBe(false);
    });
  });

  describe("ensureGrokStream", () => {
    it("should yield valid GrokChatCompletion objects", async () => {
      const validItems = [
        { choices: [{ message: { role: "assistant", content: "Hello" } }] },
        { choices: [{ delta: { content: "World" } }] },
      ];

      async function* mockStream() {
        for (const item of validItems) {
          yield item;
        }
      }

      const results = [];
      for await (const item of ensureGrokStream(mockStream())) {
        results.push(item);
      }

      expect(results).toEqual(validItems);
    });

    it("should throw TypeError for invalid stream items", async () => {
      async function* invalidStream() {
        yield { choices: [{}] }; // Valid
        yield { invalid: "data" }; // Invalid
      }

      const results = [];
      let error: Error | null = null;

      try {
        for await (const item of ensureGrokStream(invalidStream())) {
          results.push(item);
        }
      } catch (e) {
        error = e as Error;
      }

      expect(results.length).toBe(1);
      expect(error).toBeInstanceOf(TypeError);
      expect(error?.message).toBe("Stream chunk is not a GrokChatCompletion shape");
    });
  });
});