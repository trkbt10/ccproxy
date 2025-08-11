import { describe, it, expect, afterAll } from "bun:test";
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { geminiToOpenAIResponse } from "../../src/providers/gemini/openai-response-adapter";
import { geminiToOpenAIStream } from "../../src/providers/gemini/openai-stream-adapter";
import { getAdapterFor } from "../../src/providers/registry";
import type { Provider } from "../../src/config/types";
import { GeminiFetchClient, type GenerateContentRequest } from "../../src/providers/gemini/fetch-client";
import { StreamHandler } from "../../src/converters/responses-adapter/stream-handler";
import type { ChatCompletionChunk, ChatCompletion } from "openai/resources/chat/completions";
import { convertChatCompletionToResponse } from "../../src/converters/responses-adapter/chat-to-response-converter";

describe("Gemini OpenAI-compat (real API)", () => {
  const provider: Provider = { type: "gemini" };
  const getHeader = (_: string) => null;

  async function pickCheapGeminiModel(client: GeminiFetchClient): Promise<string> {
    const listed = await client.listModels();
    expect(Array.isArray(listed.models)).toBe(true);
    compatCoverage.mark("gemini", "models.list.basic");
    // Prefer flash/mini-like models used for testing economy
    const names = listed.models.map(m => m.name);
    // Strongly prefer cheaper variants; avoid matching 'mini' inside 'gemini'
    const cheap = names.filter((n) => /(^|[-_.])(?:nano|flash(?:-\d+)?|mini)(?:$|[-_.])/i.test(n));
    let selected = cheap[0];
    if (!selected) {
      const env = process.env.GEMINI_TEST_MODEL;
      if (!env) {
        throw new Error("No cheap Gemini model found from /models. Set GEMINI_TEST_MODEL to a mini/flash/nano model.");
      }
      selected = env;
    }
    // Gemini expects the path segment after "models/" in the URL builder here
    if (selected.startsWith("models/")) selected = selected.slice("models/".length);
    expect(typeof selected).toBe("string");
    return selected;
  }

  it("chat non-stream basic", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
    expect(apiKey).toBeTruthy();
    const client = new GeminiFetchClient({ apiKey: apiKey! });
    const model = await pickCheapGeminiModel(client);

    const input: GenerateContentRequest = {
      contents: [
        { role: "user", parts: [{ text: "Hello from compat test" }] },
      ],
      generationConfig: { maxOutputTokens: 64 },
    };

    const raw = await adapter.generate({ model, input });
    const out = geminiToOpenAIResponse(raw, model);
    expect(out.object).toBe("response");
    expect(out.status).toBe("completed");
    expect(out.output?.[0]).toBeTruthy();
    compatCoverage.mark("gemini", "responses.non_stream.basic");
    compatCoverage.mark("gemini", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
    const client = new GeminiFetchClient({ apiKey: apiKey! });
    const model = await pickCheapGeminiModel(client);

    const input: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: "Stream please" }] }],
      generationConfig: { maxOutputTokens: 64 },
    };

    const types: string[] = [];
    const stream = adapter.stream!({ model, input });
    for await (const ev of geminiToOpenAIStream(stream)) {
      types.push(ev.type);
    }
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
    compatCoverage.mark("gemini", "responses.stream.created");
    if (types.includes("response.output_text.delta")) {
      compatCoverage.mark("gemini", "responses.stream.delta");
    }
    compatCoverage.mark("gemini", "responses.stream.done");
    compatCoverage.mark("gemini", "responses.stream.completed");
    compatCoverage.mark("gemini", "chat.stream.chunk");
    compatCoverage.mark("gemini", "chat.stream.done");
  }, 30000);

  it("responses non-stream function_call via emulator", async () => {
    // Keep emulator-based check for conversion path only (no network)
    const completion: ChatCompletion = {
      id: "x",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gemini-test",
      choices: [ { index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] }, finish_reason: "stop" } ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const out = convertChatCompletionToResponse(completion, new Map());
    const hasFn = Array.isArray(out.output) && out.output.some((o) => o.type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("gemini", "responses.non_stream.function_call");
  });

  it("responses stream function_call via emulator", async () => {
    async function* chunks() {
      yield { id: "x", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "gemini-test", choices: [ { index:0, delta: { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "" } }] }, finish_reason: null } ] } as ChatCompletionChunk;
      yield { id: "x", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "gemini-test", choices: [ { index:0, delta: { tool_calls: [{ id: "c1", type: "function", function: { arguments: "{\"input\":\"test\"}" } }] }, finish_reason: null } ] } as ChatCompletionChunk;
      yield { id: "x", object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "gemini-test", choices: [ { index:0, delta: {}, finish_reason: "stop" } ] } as ChatCompletionChunk;
    }
    const h = new StreamHandler();
    const types: string[] = [];
    for await (const ev of h.handleStream(chunks())) { types.push(ev.type); }
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
