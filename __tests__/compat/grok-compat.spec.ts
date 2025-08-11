import { describe, it, expect, afterAll } from "bun:test";
import type { ChatCompletionChunk, ChatCompletion } from "openai/resources/chat/completions";
import { grokToOpenAIResponse, grokToOpenAIStream } from "../../src/providers/grok/openai-response-adapter";
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { StreamHandler } from "../../src/converters/responses-adapter/stream-handler";
import { convertChatCompletionToResponse } from "../../src/converters/responses-adapter/chat-to-response-converter";
import type { Provider } from "../../src/config/types";
import { getAdapterFor } from "../../src/providers/registry";
import type { OpenAICompatStreamEvent } from "../../src/providers/openai-compat/compat";

describe("Grok OpenAI-compat (real API)", () => {
  const provider: Provider = { type: "grok" };
  const getHeader = (_: string) => null;

  async function pickCheapGrokModel(): Promise<string> {
    const baseURL = "https://api.x.ai/v1";
    const key = process.env.GROK_API_KEY;
    expect(key).toBeTruthy();
    try {
      const res = await fetch(`${baseURL}/models`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) {
        const json = await res.json();
        const ids: string[] = (json?.data || []).map((m: any) => m?.id).filter(Boolean);
        if (ids.length > 0) {
          compatCoverage.mark("grok", "models.list.basic");
          const prioritized = ids.sort((a, b) => {
            const sc = (s: string) => (/mini|small/i.test(s) ? 0 : /latest/i.test(s) ? 1 : 2);
            return sc(a) - sc(b);
          });
          return prioritized[0];
        }
      }
    } catch (e) {
      compatCoverage.error("grok", "models.list.basic", `Failed to list models: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Fallback: require explicit env to avoid guessing
    const envModel = process.env.GROK_TEST_MODEL;
    if (!envModel) {
      const reason = "Set GROK_TEST_MODEL to a mini/cheap model or ensure /models endpoint works.";
      compatCoverage.error("grok", "models.list.basic", reason);
      throw new Error(reason);
    }
    return envModel;
  }

  it("chat non-stream basic", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGrokModel();
    const input = {
      model,
      messages: [{ role: "user", content: "Hello from compat test" }],
      stream: false,
    };
    const raw = await adapter.generate({ model, input });
    const out = grokToOpenAIResponse(raw, model);
    expect(out.object).toBe("response");
    expect(out.status).toBe("completed");
    expect(out.output?.[0]).toBeTruthy();
    compatCoverage.mark("grok", "responses.non_stream.basic");
    compatCoverage.mark("grok", "chat.non_stream.basic");
    // Provider tool-calls for chat.completions are not confirmed; record reasons instead of guessing.
    compatCoverage.error("grok", "chat.non_stream.function_call", "Grok chat.completions tool-calls not documented/confirmed; avoiding forced tools.");
  });

  it("chat stream chunk + done", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGrokModel();
    const input = {
      model,
      messages: [{ role: "user", content: "Stream please" }],
      stream: true,
    };
    const types: string[] = [];
    const s = adapter.stream!({ model, input });
    for await (const ev of grokToOpenAIStream(s)) {
      const e: OpenAICompatStreamEvent = ev;
      types.push(e.type);
    }
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_text.delta");
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
    compatCoverage.mark("grok", "responses.stream.created");
    compatCoverage.mark("grok", "responses.stream.delta");
    compatCoverage.mark("grok", "responses.stream.done");
    compatCoverage.mark("grok", "responses.stream.completed");
    compatCoverage.mark("grok", "chat.stream.chunk");
    compatCoverage.mark("grok", "chat.stream.done");
    compatCoverage.error("grok", "chat.stream.tool_call.delta", "Grok chat.completions tool-call deltas not confirmed for streaming.");
  }, 30000);

  it("responses non-stream function_call via emulator", async () => {
    const completion: ChatCompletion = {
      id: "y",
      object: "chat.completion" as const,
      created: Math.floor(Date.now()/1000),
      model: "grok-test",
      choices: [{ index: 0, message: { role: "assistant" as const, content: null, tool_calls: [{ id: "c1", type: "function" as const, function: { name: "t", arguments: "{}" } }] }, finish_reason: "stop" as const }]
    };
    const out = convertChatCompletionToResponse(completion, new Map());
    expect(out.output?.some((o) => o.type === "function_call")).toBe(true);
    compatCoverage.mark("grok", "responses.non_stream.function_call");
  });

  it("responses stream function_call via emulator", async () => {
    async function* chunks() {
      yield { id: "y", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "grok-test", choices: [ { index: 0, delta: { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "" } }] }, finish_reason: null } ] } as ChatCompletionChunk;
      yield { id: "y", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "grok-test", choices: [ { index: 0, delta: { tool_calls: [{ id: "c1", type: "function", function: { arguments: "{\"input\":\"test\"}" } }] }, finish_reason: null } ] } as ChatCompletionChunk;
      yield { id: "y", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "grok-test", choices: [ { index: 0, delta: {}, finish_reason: "stop" } ] } as ChatCompletionChunk;
    }
    const h = new StreamHandler();
    const types: string[] = [];
    for await (const ev of h.handleStream(chunks())) { types.push(ev.type); }
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
