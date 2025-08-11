import { describe, it, expect } from "bun:test";
import { geminiToOpenAIStream } from "./openai-stream-adapter";
import type { GenerateContentResponse, GeminiPart } from "./fetch-client";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const arr: T[] = [];
  for await (const v of it) arr.push(v);
  return arr;
}

describe("geminiToOpenAIStream", () => {
  it("emits created, delta, done, completed for text", async () => {
    async function* chunks(): AsyncGenerator<GenerateContentResponse> {
      yield { candidates: [{ content: { parts: [{ text: "Hello" } as GeminiPart] } }] };
      yield { candidates: [{ content: { parts: [{ text: "Hello, world" } as GeminiPart] } }] };
    }
    const events = await collect(geminiToOpenAIStream(chunks())) as ResponseStreamEvent[];
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_text.delta");
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
  });

  it("emits function_call added/args.delta/done when functionCall parts appear", async () => {
    async function* chunks(): AsyncGenerator<GenerateContentResponse> {
      yield {
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { name: "get_weather", args: { city: "Tokyo" } } } as GeminiPart,
              ],
            },
          },
        ],
      };
    }
    const events = await collect(geminiToOpenAIStream(chunks())) as ResponseStreamEvent[];
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    expect(types[types.length - 1]).toBe("response.completed");
  });

  it("handles mixed text growth and functionCall across chunks", async () => {
    async function* chunks(): AsyncGenerator<GenerateContentResponse> {
      // First chunk: some text only
      yield {
        candidates: [
          { content: { parts: [{ text: "Intro: " } as GeminiPart] } },
        ],
      };
      // Second chunk: more text and a functionCall appears
      yield {
        candidates: [
          {
            content: {
              parts: [
                { text: "Intro: Please call tool. " } as GeminiPart,
                { functionCall: { name: "get_weather", args: { city: "Osaka" } } } as GeminiPart,
              ],
            },
          },
        ],
      };
      // Third (final) chunk: final text
      yield {
        candidates: [
          { content: { parts: [{ text: "Intro: Please call tool. Done" } as GeminiPart] } },
        ],
      };
    }
    const events = await collect(geminiToOpenAIStream(chunks())) as ResponseStreamEvent[];
    const types = events.map((e) => e.type);
    // Text deltas should be present
    expect(types).toContain("response.output_text.delta");
    // Function call triplet should appear
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    // Stream wraps up
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
  });
});
