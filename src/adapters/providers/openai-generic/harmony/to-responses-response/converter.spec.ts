import { createHarmonyToResponsesConverter } from "./converter";
import type { HarmonyMessage } from "./types";

describe("HarmonyToResponsesConverter", () => {
  let converter: ReturnType<typeof createHarmonyToResponsesConverter>;

  beforeEach(() => {
    converter = createHarmonyToResponsesConverter({
      model: "test-model",
      idPrefix: "test",
    });
  });

  describe("convert", () => {
    it("should convert a simple text message", async () => {
      const harmonyMessage: HarmonyMessage = {
        role: "assistant",
        content: "Hello, world!",
      };

      const events = await converter.convert(harmonyMessage);

      // Should have response.created, output_item.added, text.delta, text.done, output_item.done, response.completed
      expect(events).toHaveLength(6);

      // Check response.created event
      expect(events[0].type).toBe("response.created");
      expect(events[0]).toHaveProperty("response.status", "in_progress");

      // Check output_item.added event
      expect(events[1].type).toBe("response.output_item.added");

      // Check text delta event
      expect(events[2].type).toBe("response.output_text.delta");
      expect(events[2]).toHaveProperty("delta", "Hello, world!");

      // Check text done event
      expect(events[3].type).toBe("response.output_text.done");
      expect(events[3]).toHaveProperty("text", "Hello, world!");

      // Check output_item.done event
      expect(events[4].type).toBe("response.output_item.done");

      // Check response.completed event
      expect(events[5].type).toBe("response.completed");
      expect(events[5]).toHaveProperty("response.status", "completed");
    });

    it("should convert a message with reasoning", async () => {
      const harmonyMessage: HarmonyMessage = {
        role: "assistant",
        content: "The answer is 42.",
        reasoning: "I calculated this by considering the universe.",
      };

      const events = await converter.convert(harmonyMessage);

      // Should include reasoning events
      const reasoningDelta = events.find(
        (e) => e.type === "response.output_text.delta" && "delta" in e && e.delta.includes("calculated")
      );
      expect(reasoningDelta).toBeDefined();
    });

    it("should convert a message with tool calls", async () => {
      const harmonyMessage: HarmonyMessage = {
        role: "assistant",
        content: "I need to check the weather.",
        tool_calls: [
          {
            id: "tc_123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location": "San Francisco"}',
            },
          },
        ],
      };

      const events = await converter.convert(harmonyMessage);

      // Find function call events
      const funcCallAdded = events.find(
        (e) => e.type === "response.output_item.added" && "item" in e && e.item.type === "function_call"
      );
      expect(funcCallAdded).toBeDefined();

      const funcCallArgsDone = events.find((e) => e.type === "response.function_call_arguments.done");
      expect(funcCallArgsDone).toBeDefined();
      expect(funcCallArgsDone).toHaveProperty("arguments", '{"location": "San Francisco"}');
    });

    it("should handle Harmony formatted content", async () => {
      const harmonyMessage: HarmonyMessage = {
        role: "assistant",
        content: `<|start|>
<|message|>role="assistant"
<|channel|>analysis
This is my analysis of the problem.
<|message|>role="assistant"
<|channel|>final
The solution is simple.
<|end|>`,
      };

      const events = await converter.convert(harmonyMessage);

      // Check that both analysis and final content are processed
      const textDeltas = events.filter((e) => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);

      const textDone = events.find(
        (e) => e.type === "response.output_text.done" && "text" in e && e.text.includes("solution")
      );
      expect(textDone).toBeDefined();
    });

    it("should handle streaming mode", async () => {
      converter = createHarmonyToResponsesConverter({
        model: "test-model",
        stream: true,
      });

      const harmonyMessage: HarmonyMessage = {
        role: "assistant",
        content: "This is a long message that should be streamed in chunks.",
      };

      const events = await converter.convert(harmonyMessage);

      // In streaming mode, we should have text delta events
      const textDeltas = events.filter((e) => e.type === "response.output_text.delta");
      expect(textDeltas.length).toBeGreaterThan(0);
    });

    it("should handle empty content gracefully", async () => {
      const harmonyMessage: HarmonyMessage = {
        role: "assistant",
        content: "",
      };

      const events = await converter.convert(harmonyMessage);

      // Should still have basic structure events
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("response.created");
      expect(events[events.length - 1].type).toBe("response.completed");
    });
  });
});
