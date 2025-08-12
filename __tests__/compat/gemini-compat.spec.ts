import { describe, it, expect, afterAll } from "bun:test";
import {
  compatCoverage,
  writeMarkdownReport,
  writeCombinedMarkdownReport,
} from "./compat-coverage";
import { buildOpenAICompatibleClientForGemini } from "../../src/adapters/providers/gemini/openai-compatible";
import type { Provider } from "../../src/config/types";
import type { GenerateContentRequest, GeminiPart } from "../../src/adapters/providers/gemini/fetch-client";
import {
  isGeminiResponse,
  ensureGeminiStream,
} from "../../src/adapters/providers/guards";
import { resolveModelForProvider } from "../../src/adapters/providers/shared/model-mapper";

describe("Gemini OpenAI-compat (real API)", () => {
  const apiKeyFromEnv =
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;
  const provider: Provider = apiKeyFromEnv
    ? { type: "gemini", apiKey: apiKeyFromEnv }
    : { type: "gemini" };

  async function selectGeminiModel(client: ReturnType<typeof buildOpenAICompatibleClientForGemini>, provider: Provider): Promise<string> {
    try {
      const listed = await client.models.list();
      const ids = listed.data.map((m) => m.id);
      expect(Array.isArray(listed.data)).toBe(true);
      if (ids.length > 0) compatCoverage.mark("gemini", "models.list.basic");
      compatCoverage.log(
        "gemini",
        `models.list: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", ..." : ""}`
      );
    } catch (e) {
      compatCoverage.error(
        "gemini",
        "models.list.basic",
        `Failed to list models: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return await resolveModelForProvider({ provider });
  }

  it("chat non-stream basic", async () => {
    const client = buildOpenAICompatibleClientForGemini(provider);
    const model = await selectGeminiModel(client, provider);
    const out = await client.responses.create({ model, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello from compat test' }] }], stream: false });
    expect((out as any).object).toBe("response");
    expect((out as any).status).toBe("completed");
    expect(Array.isArray((out as any).output)).toBe(true);
    compatCoverage.mark("gemini", "responses.non_stream.basic");
    compatCoverage.mark("gemini", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const client = buildOpenAICompatibleClientForGemini(provider);
    const model = await selectGeminiModel(client, provider);
    const types: string[] = [];
    const stream = await client.responses.create({ model, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '長文で出力してください。' }] }], stream: true });
    for await (const ev of (stream as AsyncIterable<any>)) types.push(ev.type);
    compatCoverage.log("gemini", `chat.stream events: ${types.join(", ")}`);
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_text.delta");
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
    compatCoverage.mark("gemini", "responses.stream.created");
    compatCoverage.mark("gemini", "responses.stream.delta");
    compatCoverage.mark("gemini", "responses.stream.done");
    compatCoverage.mark("gemini", "responses.stream.completed");
    compatCoverage.mark("gemini", "chat.stream.chunk");
    compatCoverage.mark("gemini", "chat.stream.done");
  }, 30000);

  it("chat non-stream function_call (real)", async () => {
    const client = buildOpenAICompatibleClientForGemini(provider);
    const model = await selectGeminiModel(client, provider);
    const tools = [{ type: 'function', name: 'get_current_temperature', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }, description: 'Get temp' }];
    const out = await client.responses.create({ model, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: "Use tool to get temperature for San Francisco" }] }], tools, tool_choice: { type: 'function', name: 'get_current_temperature' }, stream: false });
    const hasFn = Array.isArray((out as any).output) && (out as any).output.some((o: any) => o.type === 'function_call');
    expect(hasFn).toBe(true);
    compatCoverage.mark("gemini", "chat.non_stream.function_call");
    compatCoverage.mark("gemini", "responses.non_stream.function_call");
  }, 30000);

  it("chat stream tool_call delta (real)", async () => {
    const client = buildOpenAICompatibleClientForGemini(provider);
    const model = await selectGeminiModel(client, provider);
    const tools = [{ type: 'function', name: 'get_current_ceiling', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } }];
    const types: string[] = [];
    const stream = await client.responses.create({ model, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Call tool get_current_ceiling with location=San Francisco.' }] }], tools, tool_choice: { type: 'function', name: 'get_current_ceiling' }, stream: true });
    for await (const ev of (stream as AsyncIterable<any>)) types.push(ev.type);
    compatCoverage.log(
      "gemini",
      `function_call (stream) events: ${types.join(", ")}`
    );
    if (
      types.includes("response.output_item.added") &&
      types.includes("response.function_call_arguments.delta") &&
      types.includes("response.output_item.done")
    ) {
      compatCoverage.mark("gemini", "chat.stream.tool_call.delta");
      compatCoverage.mark("gemini", "responses.stream.function_call.added");
      compatCoverage.mark(
        "gemini",
        "responses.stream.function_call.args.delta"
      );
      compatCoverage.mark("gemini", "responses.stream.function_call.done");
    }
  }, 30000);
  // Roundtrip test removed in favor of Responses API-based coverage
});

afterAll(async () => {
  const providers = compatCoverage.providers();
  for (const prov of providers) {
    const basic = compatCoverage.report(prov);
    const report = {
      ...basic,
      generatedAt: new Date().toISOString(),
      provider: prov,
    };
    try {
      await writeMarkdownReport(report);
      // eslint-disable-next-line no-console
      console.log(
        `Saved compatibility report: reports/openai-compat/${prov}.md`
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Failed to write compatibility report:", e);
    }
  }
  try {
    const combined = providers.map((p) => ({
      ...compatCoverage.report(p),
      generatedAt: new Date().toISOString(),
      provider: p,
    }));
    await writeCombinedMarkdownReport(combined);
    // eslint-disable-next-line no-console
    console.log(
      `Saved combined compatibility report: reports/openai-compat/summary.md`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Failed to write combined report:", e);
  }
});
