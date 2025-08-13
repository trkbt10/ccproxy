import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import type { Provider } from "../../src/config/types";
import { buildOpenAICompatibleClient } from "../../src/adapters/providers/openai-client";
import { resolveModelForProvider } from "../../src/adapters/providers/shared/model-mapper";
import type {
  OpenAICompatibleClient,
  ChatCompletion,
  ChatCompletionChunk,
} from "../../src/adapters/providers/openai-client-types";

function env(key: string, dflt?: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : dflt;
}

describe("Groq OpenAI-compat (real API)", () => {
  // Provide baseURL/apiKey if env is present; otherwise fall back to provider-only.
  const apiKey = env("GROQ_API_KEY");
  const baseURL = env("GROQ_BASE_URL", "https://api.groq.com/openai/v1");
  const provider: Provider = apiKey ? { type: "groq", apiKey, baseURL } : { type: "groq", baseURL };

  async function selectGroqModel(client: OpenAICompatibleClient, provider: Provider): Promise<string> {
    try {
      const listed = await client.models.list();
      const ids = listed.data.map((m) => m.id);
      compatCoverage.log("groq", `models.list: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", ..." : ""}`);
      if (ids.length > 0) compatCoverage.mark("groq", "models.list.basic");
    } catch (e) {
      compatCoverage.error(
        "groq",
        "models.list.basic",
        `Failed to list models: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return await resolveModelForProvider({ provider });
  }

  it("chat non-stream basic", async () => {
    const client = buildOpenAICompatibleClient(provider);
    const model = await selectGroqModel(client, provider);
    const params = {
      model,
      messages: [{ role: "user" as const, content: "Hello from Groq compat test" }],
      stream: false as const,
    };
    compatCoverage.log("groq", `chat.non_stream request: ${JSON.stringify(params)}`);
    const raw = (await client.chat.completions.create(params)) as ChatCompletion;
    expect(raw).toBeTruthy();
    expect(raw.id).toBeTruthy();
    expect(raw.choices?.[0]?.message?.content).toBeTruthy();
    compatCoverage.mark("groq", "responses.non_stream.basic");
    compatCoverage.mark("groq", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const client = buildOpenAICompatibleClient(provider);
    const model = await selectGroqModel(client, provider);
    const params = {
      model,
      messages: [{ role: "user" as const, content: "Stream please" }],
      stream: true as const,
    };
    const chunks: ChatCompletionChunk[] = [];
    compatCoverage.log("groq", `chat.stream request: ${JSON.stringify(params)}`);
    const stream = (await client.chat.completions.create(params)) as AsyncIterable<ChatCompletionChunk>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    compatCoverage.log("groq", `chat.stream chunks: ${chunks.length}`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].id).toBeTruthy();
    expect(chunks.some((c) => c.choices?.[0]?.delta?.content)).toBe(true);
    compatCoverage.mark("groq", "responses.stream.created");
    compatCoverage.mark("groq", "responses.stream.delta");
    compatCoverage.mark("groq", "responses.stream.done");
    compatCoverage.mark("groq", "responses.stream.completed");
    compatCoverage.mark("groq", "chat.stream.chunk");
    compatCoverage.mark("groq", "chat.stream.done");
  }, 30000);

  it("chat non-stream function_call (real)", async () => {
    const client = buildOpenAICompatibleClient(provider);
    const model = await selectGroqModel(client, provider);
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_current_temperature",
          description: "Get the current temperature in a given location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City and state" },
              unit: { type: "string", enum: ["celsius", "fahrenheit"], default: "celsius" },
            },
            required: ["location"],
            additionalProperties: false,
          },
        },
      },
    ];
    const params = {
      model,
      messages: [{ role: "user" as const, content: "What's the temperature in Tokyo?" }],
      tools,
      tool_choice: { type: "function" as const, function: { name: "get_current_temperature" } },
      stream: false as const,
    };
    compatCoverage.log("groq", `function_call (non-stream) request: ${JSON.stringify(params)}`);
    const raw = (await client.chat.completions.create(params)) as ChatCompletion;
    const hasFn = raw.choices?.[0]?.message?.tool_calls && raw.choices[0].message.tool_calls.length > 0;
    expect(hasFn).toBe(true);
    compatCoverage.mark("groq", "chat.non_stream.function_call");
    compatCoverage.mark("groq", "responses.non_stream.function_call");
  }, 30000);

  it("chat stream tool_call delta (real)", async () => {
    const client = buildOpenAICompatibleClient(provider);
    const model = await selectGroqModel(client, provider);
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_current_ceiling",
          description: "Get the current cloud ceiling in a given location",
          parameters: {
            type: "object",
            properties: { location: { type: "string", description: "City and state" } },
            required: ["location"],
            additionalProperties: false,
          },
        },
      },
    ];
    const params = {
      model,
      messages: [
        { role: "user" as const, content: "Call tool to get ceiling for Tokyo" },
      ],
      tools,
      tool_choice: { type: "function" as const, function: { name: "get_current_ceiling" } },
      stream: true as const,
    };
    const chunks: ChatCompletionChunk[] = [];
    compatCoverage.log("groq", `function_call (stream) request: ${JSON.stringify(params)}`);
    const stream = (await client.chat.completions.create(params)) as AsyncIterable<ChatCompletionChunk>;
    for await (const chunk of stream) chunks.push(chunk);
    compatCoverage.log("groq", `function_call (stream) chunks: ${chunks.length}`);
    expect(chunks.some((c) => c.choices?.[0]?.delta?.tool_calls)).toBe(true);
    compatCoverage.mark("groq", "chat.stream.tool_call.delta");
    compatCoverage.mark("groq", "responses.stream.function_call.added");
    compatCoverage.mark("groq", "responses.stream.function_call.args.delta");
    compatCoverage.mark("groq", "responses.stream.function_call.done");
  }, 30000);
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
