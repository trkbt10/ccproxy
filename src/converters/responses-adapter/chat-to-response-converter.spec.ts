import { describe, it, expect } from "bun:test";
import { convertChatCompletionToResponse } from "./chat-to-response-converter";
import type { ChatCompletion } from "openai/resources/chat/completions";

describe("chat-to-response-converter (unit)", () => {
  it("converts tool_calls to function_call items", () => {
    const completion: ChatCompletion = {
      id: "unit",
      object: "chat.completion",
      created: Math.floor(Date.now()/1000),
      model: "unit-model",
      choices: [{ index: 0, message: { role: "assistant", content: null, refusal: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] }, logprobs: null, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const out = convertChatCompletionToResponse(completion, new Map());
    expect(out.output?.some((o) => o.type === "function_call")).toBe(true);
  });
});

