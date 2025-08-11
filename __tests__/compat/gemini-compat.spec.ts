import {
  compatCoverage,
  writeMarkdownReport,
  writeCombinedMarkdownReport,
} from "./compat-coverage";
import { geminiToOpenAIResponse } from "../../src/adapters/providers/gemini/openai-response-adapter";
import { geminiToOpenAIStream } from "../../src/adapters/providers/gemini/openai-stream-adapter";
import { getAdapterFor } from "../../src/adapters/providers/registry";
import type { Provider } from "../../src/config/types";
import type { GenerateContentRequest } from "../../src/adapters/providers/gemini/fetch-client";
import {
  isGeminiResponse,
  ensureGeminiStream,
} from "../../src/adapters/providers/guards";

describe("Gemini OpenAI-compat (real API)", () => {
  const provider: Provider = { type: "gemini" };
  const getHeader = (_: string) => null;

  async function pickCheapGeminiModel(
    adapter: ReturnType<typeof getAdapterFor>
  ): Promise<string> {
    // Always list to exercise models endpoint coverage
    const listed = await (adapter as any).listModels();
    expect(Array.isArray(listed.data)).toBe(true);
    compatCoverage.mark("gemini", "models.list.basic");
    compatCoverage.log(
      "gemini",
      `models.list: ${listed.data
        .slice(0, 5)
        .map((m: any) => m.id)
        .join(", ")}${listed.data.length > 5 ? ", ..." : ""}`
    );
    // Prefer explicit env to avoid guessing for selection
    const envModel =
      process.env.GEMINI_TEST_MODEL || process.env.GOOGLE_AI_TEST_MODEL;
    if (envModel) return envModel.replace(/^models\//, "");
    const names = listed.data.map((m: any) => m.id as string);
    const cheap = names.filter((n) =>
      /(^|[-_.])(?:nano|flash(?:-\d+)?|mini)(?:$|[-_.])/i.test(n)
    );
    const selected = cheap[0] || names[0];
    if (!selected)
      throw new Error(
        "No Gemini models available. Set GEMINI_TEST_MODEL or GOOGLE_AI_TEST_MODEL."
      );
    return selected;
  }

  it("chat non-stream basic", async () => {
    const adapter = getAdapterFor(provider, getHeader);
    const model = await pickCheapGeminiModel(adapter);

    const input: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: "Hello from compat test" }] }],
      generationConfig: { maxOutputTokens: 64 },
    };

    compatCoverage.log(
      "gemini",
      `chat.non_stream request: ${JSON.stringify(input)}`
    );
    const raw = await adapter.generate({ model, input });
    if (!isGeminiResponse(raw))
      throw new Error("Unexpected Gemini response shape");
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
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "200語以上の長文で、人工知能の歴史を複数段落で詳しく要約してください。段落の間に空行を入れ、箇条書きを1つ含めてください。",
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 512,
        responseMimeType: "text/plain" as any,
      },
    };

    const types: string[] = [];
    compatCoverage.log(
      "gemini",
      `chat.stream request: ${JSON.stringify(input)}`
    );
    const stream = adapter.stream!({ model, input });
    for await (const ev of geminiToOpenAIStream(
      ensureGeminiStream(stream as AsyncIterable<unknown>)
    )) {
      types.push(ev.type);
    }
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
      contents: [
        {
          role: "user",
          parts: [{ text: "Use tool to get temperature for San Francisco" }],
        },
      ],
      tools,
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: ["get_current_temperature"],
        },
      },
      generationConfig: { maxOutputTokens: 32 },
    } as GenerateContentRequest;
    compatCoverage.log(
      "gemini",
      `function_call (non-stream) request: ${JSON.stringify(input)}`
    );
    const raw = await adapter.generate({ model, input });
    if (!isGeminiResponse(raw))
      throw new Error("Unexpected Gemini response shape");
    const out = geminiToOpenAIResponse(raw, model);
    const hasFn =
      Array.isArray(out.output) &&
      out.output.some((o) => o.type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("gemini", "chat.non_stream.function_call");
    compatCoverage.mark("gemini", "responses.non_stream.function_call");
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
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "必ずツール get_current_ceiling を location=San Francisco で呼び出してください。テキストで回答しないでください。",
            },
          ],
        },
      ],
      tools,
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: ["get_current_ceiling"],
        },
      },
      generationConfig: { maxOutputTokens: 32 },
    } as GenerateContentRequest;
    const types: string[] = [];
    compatCoverage.log(
      "gemini",
      `function_call (stream) request: ${JSON.stringify(input)}`
    );
    const stream = adapter.stream!({ model, input });
    for await (const ev of geminiToOpenAIStream(
      ensureGeminiStream(stream as AsyncIterable<unknown>)
    )) {
      types.push(ev.type);
    }
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
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: ["get_weather"],
        },
      },
      generationConfig: { maxOutputTokens: 64 },
    } as GenerateContentRequest;
    compatCoverage.log(
      "gemini",
      `roundtrip turn1 request: ${JSON.stringify(req1)}`
    );
    const raw1 = await adapter.generate({ model, input: req1 });
    if (!isGeminiResponse(raw1))
      throw new Error("Unexpected Gemini response shape (turn1)");
    const cand = raw1.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const fn = (parts as any[]).find((p) => p && (p as any).functionCall);
    expect(!!fn).toBe(true);

    // Turn 2: supply functionResponse (fake local result is fine for test)
    const fnName = (fn as any).functionCall.name as string;
    const result = {
      ok: true,
      city: "Tokyo",
      temperature: 25,
      unit: "celsius",
    };
    const req2: GenerateContentRequest = {
      contents: [
        { role: "user", parts: [{ text: "東京の今の天気は？" }] },
        cand!.content!,
        {
          role: "function",
          parts: [{ functionResponse: { name: fnName, response: result } }],
        },
      ],
      generationConfig: { maxOutputTokens: 64 },
    } as GenerateContentRequest;
    compatCoverage.log(
      "gemini",
      `roundtrip turn2 request: ${JSON.stringify(req2)}`
    );
    const raw2 = await adapter.generate({ model, input: req2 });
    if (!isGeminiResponse(raw2))
      throw new Error("Unexpected Gemini response shape (turn2)");
    const out = geminiToOpenAIResponse(raw2, model);
    const hasAny = Array.isArray(out.output) && out.output.length > 0;
    expect(hasAny).toBe(true);
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
