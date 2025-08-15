import { StreamHandler } from "../providers/openai-generic/responses-adapter/stream-handler";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

describe("stream-handler (unit)", () => {
  it("emits function_call events across chunks", async () => {
    async function* chunks() {
      yield {
        id: "u",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "u",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "t", arguments: "" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      } as ChatCompletionChunk;
      yield {
        id: "u",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "u",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { id: "c1", type: "function", function: { arguments: "{}" } },
              ],
            },
            finish_reason: null,
          },
        ],
      } as ChatCompletionChunk;
      yield {
        id: "u",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "u",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      } as ChatCompletionChunk;
    }
    const h = new StreamHandler();
    const types: string[] = [];
    for await (const ev of h.handleStream(chunks())) {
      types.push(ev.type);
    }
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
  });
});
