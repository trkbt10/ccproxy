import { describe, it, expect } from "bun:test";
import type { ChatCompletionCreateParams, ChatCompletionChunk } from "openai/resources/chat/completions";
import { grokToChatCompletion, grokToChatCompletionStream } from "../../src/providers/grok/openai-chat-adapter";
import { grokToOpenAIResponse, grokToOpenAIStream } from "../../src/providers/grok/openai-response-adapter";
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { afterAll } from "bun:test";
import { StreamHandler } from "../../src/converters/responses-adapter/stream-handler";

describe("Grok OpenAI-compat", () => {
  it("chat non-stream basic", () => {
    const params: ChatCompletionCreateParams = { model: "grok-3", messages: [{ role: "user", content: "hi" }] } as any;
    const res = grokToChatCompletion(params);
    expect(res.object).toBe("chat.completion");
    compatCoverage.mark("grok", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const params: ChatCompletionCreateParams = { model: "grok-3", messages: [{ role: "user", content: "hello" }], stream: true } as any;
    let sawContent = false;
    let finished = false;
    for await (const ch of grokToChatCompletionStream(params) as AsyncIterable<ChatCompletionChunk>) {
      const d = ch.choices[0].delta;
      if (typeof d?.content === "string" && d.content) sawContent = true;
      if (ch.choices[0].finish_reason) finished = true;
    }
    expect(sawContent).toBe(true);
    expect(finished).toBe(true);
    compatCoverage.mark("grok", "chat.stream.chunk");
    compatCoverage.mark("grok", "chat.stream.done");
  });

  it("chat non-stream function_call when forced", () => {
    const params: ChatCompletionCreateParams = { model: "grok-3", messages: [{ role: "user", content: "use tool" }], tools: [{ type: "function", function: { name: "t", parameters: { type: "object", properties: {}, additionalProperties: false } } }] as any, tool_choice: { type: "function", function: { name: "t" } } as any } as any;
    const res = grokToChatCompletion(params);
    const calls = res.choices[0].message.tool_calls || [];
    expect(calls.length).toBeGreaterThan(0);
    compatCoverage.mark("grok", "chat.non_stream.function_call");
  });

  it("chat stream tool_call delta when forced", async () => {
    const params: ChatCompletionCreateParams = { model: "grok-3", messages: [{ role: "user", content: "use tool" }], tools: [{ type: "function", function: { name: "t", parameters: { type: "object", properties: {}, additionalProperties: false } } }] as any, tool_choice: { type: "function", function: { name: "t" } } as any, stream: true } as any;
    let sawTool = false;
    for await (const ch of grokToChatCompletionStream(params) as AsyncIterable<ChatCompletionChunk>) {
      if (Array.isArray(ch.choices[0].delta.tool_calls) && ch.choices[0].delta.tool_calls.length > 0) {
        sawTool = true;
      }
    }
    expect(sawTool).toBe(true);
    compatCoverage.mark("grok", "chat.stream.tool_call.delta");
  });

  it("responses non-stream basic via adapter", () => {
    const resp = { id: "x", choices: [{ message: { role: "assistant", content: "Hi" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } } as any;
    const out = grokToOpenAIResponse(resp, "grok-3");
    expect(out.object).toBe("response");
    compatCoverage.mark("grok", "responses.non_stream.basic");
  });

  it("responses stream created/delta/done/completed via adapter", async () => {
    async function* fake() { yield { choices: [{ delta: { content: "He" } }] }; yield { choices: [{ delta: { content: "Hello" }, finish_reason: "stop" }] }; }
    const types: string[] = [];
    for await (const ev of grokToOpenAIStream(fake() as any)) { types.push(ev.type); }
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_text.delta");
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
    compatCoverage.mark("grok", "responses.stream.created");
    compatCoverage.mark("grok", "responses.stream.delta");
    compatCoverage.mark("grok", "responses.stream.done");
    compatCoverage.mark("grok", "responses.stream.completed");
  });

  it("responses non-stream function_call via emulator", () => {
    const completion = { id: "y", object: "chat.completion", created: Math.floor(Date.now()/1000), model: "grok-3", choices: [ { index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] }, finish_reason: "stop" } ] } as any;
    const { convertChatCompletionToResponse } = require("../../src/converters/responses-adapter/chat-to-response-converter");
    const out = convertChatCompletionToResponse(completion, new Map());
    expect(out.output?.some((o: any) => o.type === "function_call")).toBe(true);
    compatCoverage.mark("grok", "responses.non_stream.function_call");
  });

  it("responses stream function_call via emulator", async () => {
    async function* chunks() {
      yield { id: "y", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "grok-3", choices: [ { index: 0, delta: { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "" } }] }, finish_reason: null } ] } as any;
      yield { id: "y", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "grok-3", choices: [ { index: 0, delta: { tool_calls: [{ id: "c1", type: "function", function: { arguments: "{\"input\":\"test\"}" } }] }, finish_reason: null } ] } as any;
      yield { id: "y", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "grok-3", choices: [ { index: 0, delta: {}, finish_reason: "stop" } ] } as any;
    }
    const h = new StreamHandler();
    const types: string[] = [];
    for await (const ev of h.handleStream(chunks() as any)) { types.push((ev as any).type); }
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    compatCoverage.mark("grok", "responses.stream.function_call.added");
    compatCoverage.mark("grok", "responses.stream.function_call.args.delta");
    compatCoverage.mark("grok", "responses.stream.function_call.done");
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
