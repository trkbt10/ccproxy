import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { buildOpenAICompatibleClientForGemini } from "../../src/adapters/providers/gemini/openai-compatible";
import type { Provider } from "../../src/config/types";
import type { OpenAICompatibleClient } from "../../src/adapters/providers/openai-client-types";
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from "../../src/adapters/providers/openai-client-types";
import { resolveModelForProvider } from "../../src/adapters/providers/shared/model-mapper";

describe("Gemini OpenAI-compat (real API)", () => {
  const apiKeyFromEnv =
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;
  const provider: Provider = apiKeyFromEnv ? { type: "gemini", apiKey: apiKeyFromEnv } : { type: "gemini" };

  async function selectGeminiModel(
    client: OpenAICompatibleClient,
    provider: Provider
  ): Promise<string> {
    try {
      const listed = await client.models.list();
      const ids = listed.data.map((m) => m.id);
      expect(Array.isArray(listed.data)).toBe(true);
      if (ids.length > 0) compatCoverage.mark("gemini", "models.list.basic");
      compatCoverage.log("gemini", `models.list: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", ..." : ""}`);
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
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Hello from compat test" }],
      stream: false,
    }) as ChatCompletion;
    expect(response.id).toBeTruthy();
    expect(response.choices).toBeTruthy();
    expect(response.choices.length).toBeGreaterThan(0);
    expect(response.choices[0].message?.content).toBeTruthy();
    compatCoverage.mark("gemini", "responses.non_stream.basic");
    compatCoverage.mark("gemini", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const client = buildOpenAICompatibleClientForGemini(provider);
    const model = await selectGeminiModel(client, provider);
    const chunks: ChatCompletionChunk[] = [];
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "長文で出力してください。" }],
      stream: true,
    });
    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      chunks.push(chunk);
    }
    compatCoverage.log("gemini", `chat.stream chunks: ${chunks.length}`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].id).toBeTruthy();
    expect(chunks.some(c => c.choices[0]?.delta?.content)).toBe(true);
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
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_current_temperature",
          parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
          description: "Get temp",
        },
      },
    ];
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Use tool to get temperature for San Francisco" }],
      tools,
      tool_choice: { type: "function", function: { name: "get_current_temperature" } },
      stream: false,
    }) as ChatCompletion;
    const hasFn = response.choices[0]?.message?.tool_calls && response.choices[0].message.tool_calls.length > 0;
    expect(hasFn).toBe(true);
    compatCoverage.mark("gemini", "chat.non_stream.function_call");
    compatCoverage.mark("gemini", "responses.non_stream.function_call");
  }, 30000);

  it("chat stream tool_call delta (real)", async () => {
    const client = buildOpenAICompatibleClientForGemini(provider);
    const model = await selectGeminiModel(client, provider);
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_current_ceiling",
          parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
          description: "Get current cloud ceiling",
        },
      },
    ];
    const chunks: ChatCompletionChunk[] = [];
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Call tool get_current_ceiling with location=San Francisco." }],
      tools,
      tool_choice: { type: "function", function: { name: "get_current_ceiling" } },
      stream: true,
    });
    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      chunks.push(chunk);
    }
    compatCoverage.log("gemini", `function_call (stream) chunks: ${chunks.length}`);
    const hasToolCalls = chunks.some(c => c.choices[0]?.delta?.tool_calls);
    if (hasToolCalls) {
      compatCoverage.mark("gemini", "chat.stream.tool_call.delta");
      compatCoverage.mark("gemini", "responses.stream.function_call.added");
      compatCoverage.mark("gemini", "responses.stream.function_call.args.delta");
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
      console.log(`Saved compatibility report: reports/openai-compat/${prov}.md`);
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
    console.log(`Saved combined compatibility report: reports/openai-compat/summary.md`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Failed to write combined report:", e);
  }
});
