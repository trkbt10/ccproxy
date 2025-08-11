import {
  grokToOpenAIResponse,
  grokToOpenAIStream,
} from "../../src/adapters/providers/grok/openai-response-adapter";
import {
  compatCoverage,
  writeMarkdownReport,
  writeCombinedMarkdownReport,
} from "./compat-coverage";
import type { Provider } from "../../src/config/types";
import { isGrokChatCompletion, ensureGrokStream } from "../../src/adapters/providers/guards";
import { getAdapterFor } from "../../src/adapters/providers/registry";
import type { OpenAICompatStreamEvent } from "../../src/adapters/providers/openai-compat/compat";

describe("Grok OpenAI-compat (real API)", () => {
  const provider: Provider = { type: "grok" };

  async function pickCheapGrokModel(
    adapter: ReturnType<typeof getAdapterFor>
  ): Promise<string> {
    // Prefer explicit env to avoid guessing
    const envModel = process.env.GROK_TEST_MODEL;
    if (envModel) return envModel;
    try {
      const listed = await adapter.listModels();
      const ids = listed.data.map((m) => m.id);
      compatCoverage.log(
        "grok",
        `models.list: ${ids.slice(0, 5).join(", ")}${
          ids.length > 5 ? ", ..." : ""
        }`
      );
      if (ids.length > 0) {
        compatCoverage.mark("grok", "models.list.basic");
        const prioritized = ids.sort((a, b) => {
          const sc = (s: string) =>
            /mini|small/i.test(s) ? 0 : /latest/i.test(s) ? 1 : 2;
          return sc(a) - sc(b);
        });
        return prioritized[0];
      }
    } catch (e) {
      compatCoverage.error(
        "grok",
        "models.list.basic",
        `Failed to list models: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    throw new Error("No Grok models available. Set GROK_TEST_MODEL.");
  }

  it("chat non-stream basic", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickCheapGrokModel(adapter);
    const input = {
      model,
      messages: [{ role: "user", content: "Hello from compat test" }],
      stream: false,
    };
    compatCoverage.log(
      "grok",
      `chat.non_stream request: ${JSON.stringify(input)}`
    );
    const raw = await adapter.generate({ model, input });
    if (!isGrokChatCompletion(raw))
      throw new Error("Unexpected Grok response shape");
    const out = grokToOpenAIResponse(raw, model);
    expect(out.object).toBe("response");
    expect(out.status).toBe("completed");
    expect(out.output?.[0]).toBeTruthy();
    compatCoverage.mark("grok", "responses.non_stream.basic");
    compatCoverage.mark("grok", "chat.non_stream.basic");
  });

  it("chat stream chunk + done", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickCheapGrokModel(adapter);
    const input = {
      model,
      messages: [{ role: "user", content: "Stream please" }],
      stream: true,
    };
    const types: string[] = [];
    compatCoverage.log("grok", `chat.stream request: ${JSON.stringify(input)}`);
    const s = adapter.stream!({ model, input });
    for await (const ev of grokToOpenAIStream(
      ensureGrokStream(s as AsyncIterable<unknown>)
    )) {
      const e: OpenAICompatStreamEvent = ev;
      types.push(e.type);
    }
    compatCoverage.log("grok", `chat.stream events: ${types.join(", ")}`);
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
  }, 30000);

  it("chat non-stream function_call (real)", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickCheapGrokModel(adapter);
    const tools = [
      {
        type: "function",
        function: {
          name: "get_current_temperature",
          description: "Get the current temperature in a given location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City and state" },
              unit: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
                default: "fahrenheit",
              },
            },
            required: ["location"],
            additionalProperties: false,
          },
        },
      },
    ];
    const input = {
      model,
      messages: [
        { role: "user", content: "What's the temperature in San Francisco?" },
      ],
      tools,
      tool_choice: {
        type: "function",
        function: { name: "get_current_temperature" },
      },
      stream: false,
    };
    compatCoverage.log(
      "grok",
      `function_call (non-stream) request: ${JSON.stringify(input)}`
    );
    const raw = await adapter.generate({ model, input });
    if (!isGrokChatCompletion(raw))
      throw new Error("Unexpected Grok response shape");
    const out = grokToOpenAIResponse(raw, model);
    const hasFn =
      Array.isArray(out.output) &&
      out.output.some((o) => o.type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("grok", "chat.non_stream.function_call");
    compatCoverage.mark("grok", "responses.non_stream.function_call");
  }, 30000);

  it("chat stream tool_call delta (real)", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickCheapGrokModel(adapter);
    const tools = [
      {
        type: "function",
        function: {
          name: "get_current_ceiling",
          description: "Get the current cloud ceiling in a given location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City and state" },
            },
            required: ["location"],
            additionalProperties: false,
          },
        },
      },
    ];
    const input = {
      model,
      messages: [
        { role: "user", content: "Call tool to get ceiling for San Francisco" },
      ],
      tools,
      tool_choice: {
        type: "function",
        function: { name: "get_current_ceiling" },
      },
      stream: true,
    };
    const types: string[] = [];
    compatCoverage.log(
      "grok",
      `function_call (stream) request: ${JSON.stringify(input)}`
    );
    const s = adapter.stream!({ model, input });
    for await (const ev of grokToOpenAIStream(
      ensureGrokStream(s as AsyncIterable<unknown>)
    )) {
      const e: OpenAICompatStreamEvent = ev;
      types.push(e.type);
    }
    compatCoverage.log(
      "grok",
      `function_call (stream) events: ${types.join(", ")}`
    );
    // Should include function call added/delta/done sequence (single chunk semantics)
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    compatCoverage.mark("grok", "chat.stream.tool_call.delta");
    compatCoverage.mark("grok", "responses.stream.function_call.added");
    compatCoverage.mark("grok", "responses.stream.function_call.args.delta");
    compatCoverage.mark("grok", "responses.stream.function_call.done");
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
