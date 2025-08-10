import { describe, it, expect, afterAll } from "bun:test";
import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseOutputItem,
  Tool,
  ToolChoiceFunction,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { compatCoverage, writeMarkdownReport, writeCombinedMarkdownReport } from "./compat-coverage";
import type {
  ChatCompletionCreateParams,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function makeClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

const MODEL = process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini";

describe("OpenAI Conformance: chat/completions", () => {
  const maybe = hasApiKey() ? it : it.skip;

  maybe("non-stream returns assistant message", async () => {
    const client = makeClient();
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a test bot." },
        { role: "user", content: "Say hello." },
      ],
      stream: false,
    });
    expect(res.object).toBe("chat.completion");
    expect(res.choices?.[0]?.message?.role).toBe("assistant");
    expect(String(res.choices?.[0]?.message?.content || "")).not.toBe("");
    compatCoverage.mark("openai", "chat.non_stream.basic");
  });

  maybe("stream yields chunks and completes", async () => {
    const client = makeClient();
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Count to 3." }],
      stream: true,
    });
    let sawText = false;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) sawText = true;
    }
    expect(sawText).toBe(true);
    compatCoverage.mark("openai", "chat.stream.chunk");
    compatCoverage.mark("openai", "chat.stream.done");
  });

  maybe("non-stream returns function tool call when forced", async () => {
    const client = makeClient();
    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "test_tool",
          description: "A test tool",
          parameters: { type: "object", properties: { input: { type: "string" } }, additionalProperties: false },
        },
      },
    ];
    const tool_choice: ChatCompletionToolChoiceOption = { type: "function", function: { name: "test_tool" } };
    const params: ChatCompletionCreateParams = {
      model: MODEL,
      messages: [{ role: "user", content: "use tool" }],
      tools,
      tool_choice,
      stream: false,
    };
    const res = await client.chat.completions.create(params);
    const calls = res.choices?.[0]?.message?.tool_calls || [];
    expect(Array.isArray(calls) && calls.length > 0).toBe(true);
    compatCoverage.mark("openai", "chat.non_stream.function_call");
  });

  maybe("stream yields tool_call deltas when forced", async () => {
    const client = makeClient();
    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "test_tool",
          description: "A test tool",
          parameters: { type: "object", properties: { input: { type: "string" } }, additionalProperties: false },
        },
      },
    ];
    const tool_choice: ChatCompletionToolChoiceOption = { type: "function", function: { name: "test_tool" } };
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "use tool" }],
      tools,
      tool_choice,
      stream: true,
    });
    let sawToolDelta = false;
    let sawName = false;
    let sawArgs = false;
    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const tc = chunk.choices?.[0]?.delta?.tool_calls;
      if (Array.isArray(tc) && tc.length > 0) {
        sawToolDelta = true;
        const t = tc[0];
        const n = (t as any).function?.name;
        const a = (t as any).function?.arguments;
        if (typeof n === "string" && n.length > 0) sawName = true;
        if (typeof a === "string" && a.length > 0) sawArgs = true;
      }
    }
    expect(sawToolDelta).toBe(true);
    expect(sawName || sawArgs).toBe(true);
    compatCoverage.mark("openai", "chat.stream.tool_call.delta");
  });
});

describe("OpenAI Conformance: responses", () => {
  const maybe = hasApiKey() ? it : it.skip;

  maybe("non-stream returns response object", async () => {
    const client = makeClient();
    const params: ResponseCreateParams = {
      model: MODEL,
      input: "Hello",
    };
    const res: OpenAIResponse = await client.responses.create(params);
    expect(res.object).toBe("response");
    expect(Array.isArray(res.output)).toBe(true);
    compatCoverage.mark("openai", "responses.non_stream.basic");
  });

  maybe("non-stream returns function_call item when forced", async () => {
    const client = makeClient();
    const tools: Tool[] = [
      { type: "function", name: "test_tool", description: "A test tool", parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"], additionalProperties: false }, strict: true },
    ];
    const tool_choice: ToolChoiceFunction = { type: "function", name: "test_tool" };
    const params: ResponseCreateParamsNonStreaming = { model: MODEL, input: "use tool", tools, tool_choice };
    const res = await client.responses.create(params);
    const hasFn = Array.isArray(res.output) && res.output.some((o: ResponseOutputItem) => (o as any).type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("openai", "responses.non_stream.function_call");
  });

  maybe("stream yields standard SSE events", async () => {
    const client = makeClient();
    const params: ResponseCreateParamsStreaming = {
      model: MODEL,
      input: "Hello streaming",
      stream: true,
    };
    const stream = await client.responses.create(params);
    let created = false, delta = false, done = false, completed = false;
    for await (const ev of stream as AsyncIterable<ResponseStreamEvent>) {
      if (ev.type === "response.created") created = true;
      if (ev.type === "response.output_text.delta") delta = true;
      if (ev.type === "response.output_text.done") done = true;
      if (ev.type === "response.completed") completed = true;
    }
    expect(created).toBe(true);
    expect(delta).toBe(true);
    expect(done).toBe(true);
    expect(completed).toBe(true);
    compatCoverage.mark("openai", "responses.stream.created");
    compatCoverage.mark("openai", "responses.stream.delta");
    compatCoverage.mark("openai", "responses.stream.done");
    compatCoverage.mark("openai", "responses.stream.completed");
  });

  maybe("stream yields function_call events when tools required", async () => {
    const client = makeClient();
    const tools: Tool[] = [
      {
        type: "function",
        name: "test_tool",
        description: "A test tool",
        parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"], additionalProperties: false },
        strict: true,
      },
    ];
    const tool_choice: ToolChoiceFunction = { type: "function", name: "test_tool" };
    const params: ResponseCreateParamsStreaming = {
      model: MODEL,
      input: "use tool",
      tools,
      tool_choice,
      stream: true,
    };
    const stream = await client.responses.create(params);
    let added = false, argsDelta = false, itemDone = false;
    for await (const ev of stream) {
      if (ev.type === "response.output_item.added") added = true;
      if (ev.type === "response.function_call_arguments.delta") argsDelta = true;
      if (ev.type === "response.output_item.done") itemDone = true;
    }
    expect(added).toBe(true);
    expect(argsDelta).toBe(true);
    expect(itemDone).toBe(true);
    compatCoverage.mark("openai", "responses.stream.function_call.added");
    compatCoverage.mark("openai", "responses.stream.function_call.args.delta");
    compatCoverage.mark("openai", "responses.stream.function_call.done");
  });
});

describe("OpenAI Conformance: models", () => {
  const maybe = hasApiKey() ? it : it.skip;

  maybe("list returns model objects", async () => {
    const client = makeClient();
    const res = await client.models.list();
    expect(res.object).toBe("list");
    expect(Array.isArray(res.data)).toBe(true);
    // Not asserting specific ids; only object shape
    if (res.data.length > 0) {
      expect(res.data[0].object).toBe("model");
    }
    compatCoverage.mark("openai", "models.list.basic");
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
      console.warn("Failed to write compatibility report:", e);
    }
  }
  try {
    const combined = providers.map((p) => ({ ...compatCoverage.report(p), generatedAt: new Date().toISOString(), provider: p }));
    await writeCombinedMarkdownReport(combined);
    // eslint-disable-next-line no-console
    console.log(`Saved combined compatibility report: reports/openai-compat/summary.md`);
  } catch (e) {
    console.warn("Failed to write combined report:", e);
  }
});
