import { describe, it, expect } from "bun:test";
import type { ChatCompletionCreateParams, ChatCompletionChunk } from "openai/resources/chat/completions";
import { geminiToChatCompletion, geminiToChatCompletionStream } from "../../src/providers/gemini/openai-chat-adapter";
import { geminiToOpenAIResponse } from "../../src/providers/gemini/openai-response-adapter";
import { geminiToOpenAIStream } from "../../src/providers/gemini/openai-stream-adapter";
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { afterAll } from "bun:test";
import { StreamHandler } from "../../src/converters/responses-adapter/stream-handler";

describe("Gemini OpenAI-compat", () => {
  it("chat non-stream basic", () => {
    const params: ChatCompletionCreateParams = { model: "gemini-1.5", messages: [{ role: "user", content: "hi" }] } as any;
    const res = geminiToChatCompletion(params);
    expect(res.object).toBe("chat.completion");
    expect(res.choices[0].message.role).toBe("assistant");
    compatCoverage.mark("gemini", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const params: ChatCompletionCreateParams = { model: "gemini-1.5", messages: [{ role: "user", content: "hello" }], stream: true } as any;
    let sawContent = false;
    let finished = false;
    for await (const ch of geminiToChatCompletionStream(params) as AsyncIterable<ChatCompletionChunk>) {
      const d = ch.choices[0].delta;
      if (typeof d?.content === "string" && d.content) sawContent = true;
      if (ch.choices[0].finish_reason) finished = true;
    }
    expect(sawContent).toBe(true);
    expect(finished).toBe(true);
    compatCoverage.mark("gemini", "chat.stream.chunk");
    compatCoverage.mark("gemini", "chat.stream.done");
  });

  it("chat non-stream function_call when forced", () => {
    const params: ChatCompletionCreateParams = { model: "gemini-1.5", messages: [{ role: "user", content: "use tool" }], tools: [{ type: "function", function: { name: "t", parameters: { type: "object", properties: {}, additionalProperties: false } } }] as any, tool_choice: { type: "function", function: { name: "t" } } as any } as any;
    const res = geminiToChatCompletion(params);
    const calls = res.choices[0].message.tool_calls || [];
    expect(calls.length).toBeGreaterThan(0);
    compatCoverage.mark("gemini", "chat.non_stream.function_call");
  });

  it("chat stream tool_call delta when forced", async () => {
    const params: ChatCompletionCreateParams = { model: "gemini-1.5", messages: [{ role: "user", content: "use tool" }], tools: [{ type: "function", function: { name: "t", parameters: { type: "object", properties: {}, additionalProperties: false } } }] as any, tool_choice: { type: "function", function: { name: "t" } } as any, stream: true } as any;
    let sawTool = false;
    for await (const ch of geminiToChatCompletionStream(params) as AsyncIterable<ChatCompletionChunk>) {
      if (Array.isArray(ch.choices[0].delta.tool_calls) && ch.choices[0].delta.tool_calls.length > 0) {
        sawTool = true;
      }
    }
    expect(sawTool).toBe(true);
    compatCoverage.mark("gemini", "chat.stream.tool_call.delta");
  });

  it("responses non-stream basic via adapter", () => {
    const resp = { candidates: [{ content: { parts: [{ text: "Hello" }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } } as any;
    const out = geminiToOpenAIResponse(resp, "gemini-1.5");
    expect(out.object).toBe("response");
    compatCoverage.mark("gemini", "responses.non_stream.basic");
  });

  it("responses stream created/delta/done/completed via adapter", async () => {
    async function* fake() { yield { candidates: [{ content: { parts: [{ text: "He" }] } }] } as any; yield { candidates: [{ content: { parts: [{ text: "Hello" }] } }] } as any; }
    const events: string[] = [];
    for await (const ev of geminiToOpenAIStream(fake())) { events.push(ev.type); }
    expect(events[0]).toBe("response.created");
    expect(events).toContain("response.output_text.delta");
    expect(events).toContain("response.output_text.done");
    expect(events[events.length - 1]).toBe("response.completed");
    compatCoverage.mark("gemini", "responses.stream.created");
    compatCoverage.mark("gemini", "responses.stream.delta");
    compatCoverage.mark("gemini", "responses.stream.done");
    compatCoverage.mark("gemini", "responses.stream.completed");
  });

  it("responses non-stream function_call via emulator", () => {
    // Build ChatCompletion with tool_calls and convert
    const completion = {
      id: "x",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gemini-1.5",
      choices: [ { index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] }, finish_reason: "stop" } ],
    } as any;
    const { convertChatCompletionToResponse } = require("../../src/converters/responses-adapter/chat-to-response-converter");
    const out = convertChatCompletionToResponse(completion, new Map());
    const hasFn = Array.isArray(out.output) && out.output.some((o: any) => o.type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("gemini", "responses.non_stream.function_call");
  });

  it("responses stream function_call via emulator", async () => {
    // Build ChatCompletionChunk stream with tool_calls deltas
    async function* chunks() {
      yield { id: "x", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "gemini-1.5", choices: [ { index:0, delta: { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "" } }] }, finish_reason: null } ] } as any;
      yield { id: "x", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "gemini-1.5", choices: [ { index:0, delta: { tool_calls: [{ id: "c1", type: "function", function: { arguments: "{\"input\":\"test\"}" } }] }, finish_reason: null } ] } as any;
      yield { id: "x", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "gemini-1.5", choices: [ { index:0, delta: {}, finish_reason: "stop" } ] } as any;
    }
    const h = new StreamHandler();
    const types: string[] = [];
    for await (const ev of h.handleStream(chunks() as any)) { types.push((ev as any).type); }
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    compatCoverage.mark("gemini", "responses.stream.function_call.added");
    compatCoverage.mark("gemini", "responses.stream.function_call.args.delta");
    compatCoverage.mark("gemini", "responses.stream.function_call.done");
  });
});

afterAll(async () => {
  const providers = compatCoverage.providers();
  for (const prov of providers) {
    const basic = compatCoverage.report(prov);
    const report = { ...basic, generatedAt: new Date().toISOString(), provider: prov };
    try {
      await writeMarkdownReport(report);
      // eslint-disable-next-line no-console
      console.log(`Saved compatibility report: reports/openai-compat/${prov}.md`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Failed to write compatibility report:", e);
    }
  }
  try {
    const combined = providers.map((p) => ({ ...compatCoverage.report(p), generatedAt: new Date().toISOString(), provider: p }));
    await writeCombinedMarkdownReport(combined);
    // eslint-disable-next-line no-console
    console.log(`Saved combined compatibility report: reports/openai-compat/summary.md`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Failed to write combined report:", e);
  }
});
