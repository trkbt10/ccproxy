import type { Provider } from "../../../config/types";
import {
  buildOpenAICompatibleClientForGrok,
  responsesToGrokRequest,
} from "./openai-compatible";

function fakeAdapter() {
  return {
    name: "grok",
    async generate({ input }: any) {
      return {
        id: "chatcmpl_1",
        choices: [
          {
            message: {
              role: "assistant",
              content: `Echo:${input.messages[0]?.content || ""}`,
            },
          },
        ],
      };
    },
    async *stream({ input }: any) {
      yield { id: "chatcmpl_1", choices: [{ delta: { content: "Echo:" } }] };
      yield {
        id: "chatcmpl_1",
        choices: [
          { delta: { content: String(input.messages[0]?.content || "") } },
        ],
      };
      yield { id: "chatcmpl_1", choices: [{ finish_reason: "stop" }] };
    },
    async listModels() {
      return {
        object: "list" as const,
        data: [{ id: "grok-2-latest", object: "model" as const }],
      };
    },
  };
}

describe("grok openai-compatible", () => {
  const provider: Provider = {
    type: "grok",
    apiKey: "x",
    baseURL: "http://local",
  };

  it("responsesToGrokRequest maps simple message", () => {
    const body = responsesToGrokRequest({
      model: "grok-2-latest",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Hello" }],
        },
      ],
    } as any);
    expect(body.messages[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("non-stream create returns OpenAI-compatible response", async () => {
    const client = buildOpenAICompatibleClientForGrok(
      provider,
      undefined,
      fakeAdapter() as any
    );
    const res: any = await client.responses.create({
      model: "grok-2-latest",
      input: [{ type: "message", role: "user", content: "Hello" }],
    } as any);
    expect(res.object).toBe("response");
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("stream create yields events", async () => {
    const client = buildOpenAICompatibleClientForGrok(
      provider,
      undefined,
      fakeAdapter() as any
    );
    const events: string[] = [];
    const iter = (await client.responses.create({
      model: "grok-2-latest",
      input: [{ type: "message", role: "user", content: "Hello" }],
      stream: true,
    } as any)) as AsyncIterable<any>;
    for await (const ev of iter) {
      events.push(ev.type);
    }
    expect(events[0]).toBe("response.created");
    expect(events).toContain("response.output_text.delta");
    expect(events[events.length - 1]).toBe("response.completed");
  });
});
