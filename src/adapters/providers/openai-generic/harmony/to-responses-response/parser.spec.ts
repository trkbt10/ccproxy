import { createHarmonyResponseParser } from "./parser";
import type { HarmonyMessage } from "./types";

describe("HarmonyResponseParser", () => {
  let parser: ReturnType<typeof createHarmonyResponseParser>;

  beforeEach(() => {
    parser = createHarmonyResponseParser();
  });

  describe("parseResponse", () => {
    it("should parse simple content", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: "Hello, world!",
      };

      const result = await parser.parseResponse(message);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        channel: "final",
        content: "Hello, world!",
      });
      expect(result.reasoning).toBeUndefined();
      expect(result.toolCalls).toBeUndefined();
    });

    it("should parse reasoning from response", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: "The answer is 42.",
        reasoning: "I calculated this by deep thought.",
      };

      const result = await parser.parseResponse(message);

      expect(result.reasoning).toBe("I calculated this by deep thought.");
      expect(result.messages).toHaveLength(1);
    });

    it("should parse tool calls in OpenAI format", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: "Let me check the weather.",
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location": "NYC"}',
            },
          },
        ],
      };

      const result = await parser.parseResponse(message);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: "call_123",
        name: "get_weather",
        arguments: '{"location": "NYC"}',
      });
    });

    it("should parse Harmony formatted content with channels", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: `<|start|>
<|message|>role="assistant"
<|channel|>analysis
Let me analyze this problem step by step.
<|message|>role="assistant"
<|channel|>commentary
This is an interesting challenge.
<|message|>role="assistant"
<|channel|>final
The solution is to use recursion.
<|end|>`,
      };

      const result = await parser.parseResponse(message);

      expect(result.messages).toHaveLength(3);

      expect(result.messages[0]).toEqual({
        channel: "analysis",
        content: "Let me analyze this problem step by step.",
      });

      expect(result.messages[1]).toEqual({
        channel: "commentary",
        content: "This is an interesting challenge.",
      });

      expect(result.messages[2]).toEqual({
        channel: "final",
        content: "The solution is to use recursion.",
      });

      // Reasoning should be extracted from analysis channel
      expect(result.reasoning).toBe("Let me analyze this problem step by step.");
    });

    it("should parse tool calls from Harmony format", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: `<|start|>
<|message|>role="assistant"
<|channel|>final
<|call|>functions.get_weather
{"location": "San Francisco", "unit": "celsius"}
<|message|>role="assistant"
<|channel|>final
I'll check the weather for you.
<|end|>`,
      };

      const result = await parser.parseResponse(message);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe("get_weather");
      expect(result.toolCalls![0].arguments).toBe('{"location": "San Francisco", "unit": "celsius"}');
      expect(result.toolCalls![0].id).toMatch(/^fc_/);
    });

    it("should handle constrain types", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: `<|start|>
<|message|>role="assistant"
<|channel|>final
<|constrain|>json
{"result": "success", "value": 42}
<|end|>`,
      };

      const result = await parser.parseResponse(message);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].constrainType).toBe("json");
      expect(result.messages[0].content).toBe('{"result": "success", "value": 42}');
    });

    it("should handle return recipients", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: `<|start|>
<|message|>role="assistant"
<|channel|>final
<|return|>user
Here is your answer.
<|end|>`,
      };

      const result = await parser.parseResponse(message);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].recipient).toBe("user");
      expect(result.messages[0].isToolCall).toBe(false);
    });

    it("should handle empty Harmony content", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: `<|start|>
<|end|>`,
      };

      const result = await parser.parseResponse(message);

      expect(result.messages).toHaveLength(0);
      expect(result.reasoning).toBeUndefined();
      expect(result.toolCalls).toBeUndefined();
    });

    it("should handle malformed tool calls gracefully", async () => {
      const message: HarmonyMessage = {
        role: "assistant",
        content: "Checking...",
        tool_calls: [
          {
            id: "call_456",
            // Missing required fields - should handle gracefully
          } as any,
        ],
      };

      const result = await parser.parseResponse(message);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: "call_456",
        name: "unknown",
        arguments: "{}",
      });
    });
  });
});
