import { describe, it, expect, afterAll } from "bun:test";
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { geminiToOpenAIResponse } from "../../src/providers/gemini/openai-response-adapter";
import { geminiToOpenAIStream } from "../../src/providers/gemini/openai-stream-adapter";
import { getAdapterFor } from "../../src/providers/registry";
import type { Provider } from "../../src/config/types";
import type { GenerateContentRequest } from "../../src/providers/gemini/fetch-client";
import { isGeminiResponse, ensureGeminiStream } from "../../src/providers/guards";
import { hasListModels } from "../../src/providers/guards";
import { StreamHandler } from "../../src/converters/responses-adapter/stream-handler";
import type { ChatCompletionChunk, ChatCompletion } from "openai/resources/chat/completions";
import { convertChatCompletionToResponse } from "../../src/converters/responses-adapter/chat-to-response-converter";

describe("Gemini OpenAI-compat (real API)", () => {
  const provider: Provider = { type: "gemini" };
  const getHeader = (_: string) => null;

  async function pickCheapGeminiModel(adapter: ReturnType<typeof getAdapterFor>): Promise<string> {
    const listed = await adapter.listModels();
    expect(Array.isArray(listed.data)).toBe(true);
    compatCoverage.mark("gemini", "models.list.basic");
    compatCoverage.log("gemini", `models.list: ${listed.data.slice(0,5).map(m=>m.id).join(", ")}${listed.data.length>5?", ...":""}`);
    const names = listed.data.map((m) => m.id);
    // Strongly prefer cheaper variants; avoid matching 'mini' inside 'gemini'
    const cheap = names.filter((n) => /(^|[-_.])(?:nano|flash(?:-\d+)?|mini)(?:$|[-_.])/i.test(n));
    let selected = cheap[0];
    if (!selected) {
      const env = process.env.GEMINI_TEST_MODEL || process.env.GOOGLE_AI_TEST_MODEL;
      if (!env) {
        throw new Error("No cheap Gemini model found from /models. Set GEMINI_TEST_MODEL or GOOGLE_AI_TEST_MODEL to a mini/flash/nano model.");
      }
      selected = env;
    }
    expect(typeof selected).toBe("string");
    return selected;
  }

  it("chat non-stream basic", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGeminiModel(adapter);

    const input: GenerateContentRequest = {
      contents: [
        { role: "user", parts: [{ text: "Hello from compat test" }] },
      ],
      generationConfig: { maxOutputTokens: 64 },
    };

    compatCoverage.log("gemini", `chat.non_stream request: ${JSON.stringify(input)}`);
    const raw = await adapter.generate({ model, input });
    if (!isGeminiResponse(raw)) throw new Error("Unexpected Gemini response shape");
    const out = geminiToOpenAIResponse(raw, model);
    expect(out.object).toBe("response");
    expect(out.status).toBe("completed");
    expect(out.output?.[0]).toBeTruthy();
    compatCoverage.mark("gemini", "responses.non_stream.basic");
    compatCoverage.mark("gemini", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGeminiModel(adapter);

    const input: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: "Stream please" }] }],
      generationConfig: { maxOutputTokens: 64 },
    };

    const types: string[] = [];
    compatCoverage.log("gemini", `chat.stream request: ${JSON.stringify(input)}`);
    const stream = adapter.stream!({ model, input });
    for await (const ev of geminiToOpenAIStream(ensureGeminiStream(stream as AsyncIterable<unknown>))) {
      types.push(ev.type);
    }
    compatCoverage.log("gemini", `chat.stream events: ${types.join(", ")}`);
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

  it("chat non-stream function_call (real)", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGeminiModel(adapter);
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_current_temperature",
            description: "Get the current temperature in a given location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
          },
        ],
      },
    ];
    const input: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: "Use tool to get temperature for San Francisco" }] }],
      tools,
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["get_current_temperature"] } },
      generationConfig: { maxOutputTokens: 32 },
    } as GenerateContentRequest;
    compatCoverage.log("gemini", `function_call (non-stream) request: ${JSON.stringify(input)}`);
    const raw = await adapter.generate({ model, input });
    if (!isGeminiResponse(raw)) throw new Error("Unexpected Gemini response shape");
    const out = geminiToOpenAIResponse(raw, model);
    const hasFn = Array.isArray(out.output) && out.output.some((o) => o.type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("gemini", "chat.non_stream.function_call");
  }, 30000);

  it("chat stream tool_call delta (real)", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGeminiModel(adapter);
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_current_ceiling",
            description: "Get the current cloud ceiling in a given location",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
            },
          },
        ],
      },
    ];
    const input: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: "Call tool to get ceiling for San Francisco" }] }],
      tools,
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["get_current_ceiling"] } },
      generationConfig: { maxOutputTokens: 32 },
    } as GenerateContentRequest;
    const types: string[] = [];
    compatCoverage.log("gemini", `function_call (stream) request: ${JSON.stringify(input)}`);
    const stream = adapter.stream!({ model, input });
    for await (const ev of geminiToOpenAIStream(ensureGeminiStream(stream as AsyncIterable<unknown>))) {
      types.push(ev.type);
    }
    compatCoverage.log("gemini", `function_call (stream) events: ${types.join(", ")}`);
    if (types.includes("response.output_item.added") && types.includes("response.function_call_arguments.delta") && types.includes("response.output_item.done")) {
      compatCoverage.mark("gemini", "chat.stream.tool_call.delta");
    }
  }, 30000);

  it("chat function_call roundtrip (real)", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGeminiModel(adapter);
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_weather",
            description: "Get current weather for a city",
            parameters: {
              type: "object",
              properties: {
                city: { type: "string" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["city"],
            },
          },
        ],
      },
    ];

    // Turn 1: get functionCall
    const req1: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: "東京の今の天気は？" }] }],
      tools,
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["get_weather"] } },
      generationConfig: { maxOutputTokens: 64 },
    } as GenerateContentRequest;
    compatCoverage.log("gemini", `roundtrip turn1 request: ${JSON.stringify(req1)}`);
    const raw1 = await adapter.generate({ model, input: req1 });
    if (!isGeminiResponse(raw1)) throw new Error("Unexpected Gemini response shape (turn1)");
    const cand = raw1.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const fn = (parts as any[]).find((p) => p && (p as any).functionCall);
    expect(!!fn).toBe(true);

    // Turn 2: supply functionResponse (fake local result is fine for test)
    const fnName = (fn as any).functionCall.name as string;
    const result = { ok: true, city: "Tokyo", temperature: 25, unit: "celsius" };
    const req2: GenerateContentRequest = {
      contents: [
        { role: "user", parts: [{ text: "東京の今の天気は？" }] },
        cand!.content!,
        { role: "function", parts: [{ functionResponse: { name: fnName, response: result } }] },
      ],
      generationConfig: { maxOutputTokens: 64 },
    } as GenerateContentRequest;
    compatCoverage.log("gemini", `roundtrip turn2 request: ${JSON.stringify(req2)}`);
    const raw2 = await adapter.generate({ model, input: req2 });
    if (!isGeminiResponse(raw2)) throw new Error("Unexpected Gemini response shape (turn2)");
    const out = geminiToOpenAIResponse(raw2, model);
    const hasAny = Array.isArray(out.output) && out.output.length > 0;
    expect(hasAny).toBe(true);
  }, 30000);

  it("responses non-stream function_call via emulator", async () => {
    // Keep emulator-based check for conversion path only (no network)
    const completion: ChatCompletion = {
      id: "x",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gemini-test",
      choices: [ { index: 0, message: { role: "assistant", content: null, refusal: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] }, logprobs: null, finish_reason: "stop" } ],
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

  it("chat stream function_call via adapter (emulated)", async () => {
    // Emulate GenerateContentResponse stream including functionCall parts
    async function* chunks() {
      yield { candidates: [{ content: { parts: [{ functionCall: { name: "t", args: { city: "Tokyo" } } }] } }] } as any;
    }
    const types: string[] = [];
    for await (const ev of geminiToOpenAIStream(chunks())) {
      types.push(ev.type);
    }
    expect(types).toContain("response.created");
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    expect(types).toContain("response.completed");
    compatCoverage.mark("gemini", "chat.stream.tool_call.delta");
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
