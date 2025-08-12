import type { Provider } from "../../src/config/types";
// getAdapterFor removed; use OpenAI-compatible client instead
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import { buildOpenAICompatibleClientForGrok } from "../../src/adapters/providers/grok/openai-compatible";
import type { Response as OpenAIResponse, ResponseStreamEvent } from "openai/resources/responses/responses";
import {
  isOpenAIResponse,
  isResponseEventStream,
  responseHasFunctionCall,
} from "../../src/adapters/providers/openai-generic/guards";

function env(key: string, dflt?: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : dflt;
}

describe("Groq OpenAI-compat (real API)", () => {
  const apiKey = env("GROQ_API_KEY");
  const baseURL = env("GROQ_BASE_URL", "https://api.groq.com/openai/v1");
  const provider: Provider = apiKey ? { type: "groq", apiKey, baseURL } : { type: "groq" };

  it("models.list + non-stream + stream", async () => {
    // If no API key, just log and skip real calls
    if (!apiKey) {
      compatCoverage.log("groq", "skipped: GROQ_API_KEY not set");
      return expect(true).toBe(true);
    }

    const client = buildOpenAICompatibleClientForGrok(provider);
    // models.list
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

    // Use OpenAI-compatible client

    // Pick model
    const model = env("GROQ_TEST_MODEL", "mixtral-8x7b-32768");

    // Non-stream
    try {
      const maybeResp = await client.responses.create({
        model,
        input: [{ type: "message", role: "user", content: "Hello from Groq compat test" }],
        stream: false,
      });
      expect(isOpenAIResponse(maybeResp)).toBe(true);
      const resp = maybeResp as OpenAIResponse;
      expect(resp.object).toBe("response");
      compatCoverage.mark("groq", "responses.non_stream.basic");
      compatCoverage.mark("groq", "chat.non_stream.basic");
    } catch (e) {
      compatCoverage.error(
        "groq",
        "responses.non_stream.basic",
        `Non-stream failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // Stream
    try {
      const maybeStream = await client.responses.create({
        model,
        input: [{ type: "message", role: "user", content: "Stream please" }],
        stream: true,
      });
      expect(isResponseEventStream(maybeStream)).toBe(true);
      const types: string[] = [];
      for await (const ev of maybeStream) types.push(ev.type);
      expect(types[0]).toBe("response.created");
      expect(types).toContain("response.output_text.delta");
      expect(types).toContain("response.output_text.done");
      expect(types[types.length - 1]).toBe("response.completed");
      compatCoverage.mark("groq", "responses.stream.created");
      compatCoverage.mark("groq", "responses.stream.delta");
      compatCoverage.mark("groq", "responses.stream.done");
      compatCoverage.mark("groq", "responses.stream.completed");
      compatCoverage.mark("groq", "chat.stream.chunk");
      compatCoverage.mark("groq", "chat.stream.done");
    } catch (e) {
      compatCoverage.error(
        "groq",
        "responses.stream.created",
        `Stream failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, 30000);

  it("non-stream function_call", async () => {
    if (!apiKey) return expect(true).toBe(true);
    const client = buildOpenAICompatibleClientForGrok(provider);
    const model = env("GROQ_TEST_MODEL", "mixtral-8x7b-32768");
    const tools = [
      {
        type: "function" as const,
        name: "get_current_temperature",
        description: "Get the current temperature in a given location",
        parameters: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
        strict: true,
      },
    ];
    try {
      const maybeResp = await client.responses.create({
        model,
        input: [{ type: "message", role: "user", content: "What's the temperature in Tokyo?" }],
        tools,
        tool_choice: { type: "function", name: "get_current_temperature" },
        stream: false,
      });
      expect(isOpenAIResponse(maybeResp)).toBe(true);
      const resp = maybeResp as OpenAIResponse;
      expect(responseHasFunctionCall(resp)).toBe(true);
      compatCoverage.mark("groq", "responses.non_stream.function_call");
      compatCoverage.mark("groq", "chat.non_stream.function_call");
    } catch (e) {
      compatCoverage.error(
        "groq",
        "responses.non_stream.function_call",
        `Non-stream function_call failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, 30000);

  it("stream function_call delta", async () => {
    if (!apiKey) return expect(true).toBe(true);
    const client = buildOpenAICompatibleClientForGrok(provider);
    const model = env("GROQ_TEST_MODEL", "mixtral-8x7b-32768");
    const tools = [
      {
        type: "function" as const,
        name: "get_current_ceiling",
        description: "Get the current cloud ceiling",
        parameters: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
        strict: true,
      },
    ];
    try {
      const maybeStream = await client.responses.create({
        model,
        input: [{ type: "message", role: "user", content: "Call tool to get ceiling for Tokyo" }],
        tools,
        tool_choice: { type: "function", name: "get_current_ceiling" },
        stream: true,
      });
      expect(isResponseEventStream(maybeStream)).toBe(true);
      const types: string[] = [];
      for await (const ev of maybeStream) types.push(ev.type);
      expect(types).toContain("response.output_item.added");
      expect(types).toContain("response.function_call_arguments.delta");
      expect(types).toContain("response.output_item.done");
      compatCoverage.mark("groq", "responses.stream.function_call.added");
      compatCoverage.mark("groq", "responses.stream.function_call.args.delta");
      compatCoverage.mark("groq", "responses.stream.function_call.done");
      compatCoverage.mark("groq", "chat.stream.tool_call.delta");
    } catch (e) {
      compatCoverage.error(
        "groq",
        "responses.stream.function_call.added",
        `Stream function_call failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, 30000);
});

afterAll(async () => {
  const providers = ["groq"];
  for (const prov of providers) {
    const basic = compatCoverage.report(prov);
    const report = { ...basic, generatedAt: new Date().toISOString(), provider: prov };
    try {
      await writeMarkdownReport(report);
      console.log(`Saved compatibility report: reports/openai-compat/${prov}.md`);
    } catch (e) {
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
    console.log(`Saved combined compatibility report: reports/openai-compat/summary.md`);
  } catch (e) {
    console.warn("Failed to write combined compatibility report:", e);
  }
});
