import { geminiToOpenAIResponse } from "./openai-response-adapter";
import type { GenerateContentResponse, GeminiPart } from "./fetch-client";

describe("geminiToOpenAIResponse", () => {
  it("maps text parts to OpenAI Responses message", () => {
    const resp: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Hello" } as GeminiPart,
              { text: " world" } as GeminiPart,
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    };
    const out = geminiToOpenAIResponse(resp, "gemini-test");
    expect(out.object).toBe("response");
    expect(out.model).toBe("gemini-test");
    // output[0] is message with output_text content
    expect(Array.isArray(out.output)).toBe(true);
    const msg = out.output?.[0];
    const msgType =
      msg && typeof (msg as { type?: unknown }).type === 'string'
        ? (msg as { type?: unknown }).type
        : undefined;
    expect(msgType).toBe("message");
    expect(out.usage?.input_tokens).toBe(1);
    expect(out.usage?.output_tokens).toBe(2);
  });

  it("maps functionCall part to OpenAI Responses function_call item", () => {
    const resp: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Tool: " } as GeminiPart,
              {
                functionCall: { name: "get_weather", args: { city: "Tokyo" } },
              } as GeminiPart,
            ],
          },
        },
      ],
    };
    const out = geminiToOpenAIResponse(resp, "gemini-test");
    expect(Array.isArray(out.output)).toBe(true);
    const fn = out.output?.find((o) => o.type === "function_call");
    expect(fn).toBeTruthy();
    if (fn && fn.type === "function_call") {
      expect(fn.name).toBe("get_weather");
      // arguments are JSON stringified by the adapter
      expect(typeof fn.arguments).toBe("string");
      expect(fn.arguments && fn.arguments.includes("Tokyo")).toBe(true);
    }
  });
});
