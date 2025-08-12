import type { Provider } from "../../../config/types";
import { buildOpenAICompatibleClientForGrok, responsesToGrokRequest } from "./openai-compatible";
import type {
  ResponseStreamEvent,
  OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseCreateParamsNonStreaming,
} from "../openai-client-types";

// Type guard to detect AsyncIterable without using any casts
function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

describe("grok openai-compatible", () => {
  const provider: Provider = {
    type: "grok",
    apiKey: "x",
    baseURL: "http://local",
  };

  it("responsesToGrokRequest maps simple message", () => {
    const params: ResponseCreateParams = {
      model: "grok-2-latest",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Hello" }],
        },
      ],
    };
    const body = responsesToGrokRequest(params);
    expect(body.messages[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("non-stream create returns OpenAI-compatible response", async () => {
    const client = buildOpenAICompatibleClientForGrok(provider, undefined);
    const params: ResponseCreateParamsNonStreaming = {
      model: "grok-2-latest",
      input: [{ type: "message", role: "user", content: "Hello" }],
      // stream: false // implicit
    };
    const res = await client.responses.create(params);
    if (isAsyncIterable(res)) {
      throw new Error("Expected non-streaming response");
    }
    const openAIResp: OpenAIResponse = res;
    expect(openAIResp.object).toBe("response");
    expect(Array.isArray(openAIResp.output)).toBe(true);
  });

  it("stream create yields events", async () => {
    const client = buildOpenAICompatibleClientForGrok(provider, undefined);
    const events: string[] = [];
    const params: ResponseCreateParamsStreaming = {
      model: "grok-2-latest",
      input: [{ type: "message", role: "user", content: "Hello" }],
      stream: true,
    };
    const res = await client.responses.create(params);

    if (!isAsyncIterable<ResponseStreamEvent>(res)) {
      throw new Error("Expected streaming AsyncIterable");
    }

    for await (const ev of res) {
      events.push(ev.type);
    }
    expect(events[0]).toBe("response.created");
    expect(events).toContain("response.output_text.delta");
    expect(events[events.length - 1]).toBe("response.completed");
  });
});
