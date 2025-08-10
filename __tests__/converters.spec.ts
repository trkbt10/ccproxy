import { describe, it, expect } from "bun:test";
import { geminiToOpenAIStream } from "../src/providers/gemini/openai-stream-adapter";
import { geminiToOpenAIResponse } from "../src/providers/gemini/openai-response-adapter";
import { grokToOpenAIResponse, grokToOpenAIStream } from "../src/providers/grok/openai-response-adapter";
import { compatCoverage } from "./compat/compat-coverage";

describe("Converters: Gemini -> OpenAI", () => {
  it("geminiToOpenAIResponse maps text and usage", () => {
    const resp = { candidates: [{ content: { parts: [{ text: "Answer" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 } } as any;
    const out = geminiToOpenAIResponse(resp, "gemini-1.5");
    expect(out.status).toBe("completed");
    expect(out.output?.[0]?.type).toBe("message");
    expect(out.output?.[0] && (out.output[0] as any).content?.[0]?.text).toBe("Answer");
    expect(out.usage?.input_tokens).toBe(5);
    expect(out.usage?.output_tokens).toBe(7);
    compatCoverage.mark("gemini", "responses.non_stream.basic");
  });

  it("geminiToOpenAIStream produces delta events in order", async () => {
    async function* fakeGemini() {
      yield { candidates: [{ content: { parts: [{ text: "Hel" }] } }] } as any;
      yield { candidates: [{ content: { parts: [{ text: "Hello Wor" }] } }] } as any;
      yield { candidates: [{ content: { parts: [{ text: "Hello World" }] } }] } as any;
    }
    const events: string[] = [];
    for await (const ev of geminiToOpenAIStream(fakeGemini())) {
      events.push(ev.type);
    }
    expect(events[0]).toBe("response.created");
    expect(events).toContain("response.output_text.delta");
    expect(events).toContain("response.output_text.done");
    expect(events[events.length - 1]).toBe("response.completed");
    compatCoverage.mark("gemini", "responses.stream.created");
    compatCoverage.mark("gemini", "responses.stream.delta");
    compatCoverage.mark("gemini", "responses.stream.done");
    compatCoverage.mark("gemini", "responses.stream.completed");
  });

});

describe("Converters: Grok -> OpenAI", () => {
  it("grokToOpenAIResponse maps chat completion", () => {
    const resp = { id: "abc", choices: [{ message: { role: "assistant", content: "Answer" } }], usage: { prompt_tokens: 3, completion_tokens: 4 } };
    const out = grokToOpenAIResponse(resp, "grok-1");
    expect(out.id).toBe("abc");
    expect(out.output?.[0]?.type).toBe("message");
    expect(out.usage?.input_tokens).toBe(3);
    expect(out.usage?.output_tokens).toBe(4);
    compatCoverage.mark("grok", "responses.non_stream.basic");
  });

  it("grokToOpenAIStream maps chunks to delta", async () => {
    async function* chunks() {
      yield { choices: [{ delta: { content: "A" } }] };
      yield { choices: [{ delta: { content: "B" } }], done: false };
      yield { choices: [{ delta: {} , finish_reason: "stop"}] };
    }
    const events: string[] = [];
    for await (const ev of grokToOpenAIStream(chunks())) {
      events.push(ev.type);
    }
    expect(events[0]).toBe("response.created");
    expect(events).toContain("response.output_text.delta");
    expect(events).toContain("response.output_text.done");
    expect(events[events.length - 1]).toBe("response.completed");
    compatCoverage.mark("grok", "responses.stream.created");
    compatCoverage.mark("grok", "responses.stream.delta");
    compatCoverage.mark("grok", "responses.stream.done");
    compatCoverage.mark("grok", "responses.stream.completed");
  });
});
