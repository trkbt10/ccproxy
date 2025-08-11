import { describe, it, expect, afterAll } from "bun:test";
import { compatCoverage, writeMarkdownReport } from "./compat-coverage";
import type { Provider } from "../../src/config/types";
import { buildProviderClient } from "../../src/execution/routing-config";
import { getAdapterFor } from "../../src/adapters/providers/registry";
import {
  claudeToOpenAIResponse,
  claudeToOpenAIStream,
} from "../../src/adapters/providers/claude/openai-response-adapter";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import type { OpenAICompatStreamEvent } from "../../src/adapters/providers/openai-compat/compat";
import type {
  ResponseCreateParams,
  ResponseStreamEvent,
  Response as OpenAIResponse,
} from "openai/resources/responses/responses";

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

describe("Claude OpenAI-compat (real API)", () => {
  const maybe = hasApiKey() ? it : it.skip;
  const provider: Provider = { type: "claude" };

  maybe("responses non-stream basic", async () => {
    const client = buildProviderClient(
      provider,
      process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"
    );
    const res = (await client.responses.create({
      model: "gpt-4o-mini",
      input: "Hello from claude compat",
    })) as OpenAIResponse;
    expect(res.object).toBe("response");
    expect(Array.isArray(res.output)).toBe(true);
    compatCoverage.mark("claude", "responses.non_stream.basic");
  });

  maybe("responses stream chunk + done", async () => {
    const client = buildProviderClient(
      provider,
      process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"
    );
    const types: string[] = [];
    const stream = (await client.responses.create({
      model: "gpt-4o-mini",
      input: "Count to 3.",
      stream: true,
    })) as AsyncIterable<ResponseStreamEvent>;
    for await (const ev of stream) types.push(ev.type);
    expect(types.length).toBeGreaterThan(0);
    compatCoverage.mark("claude", "responses.stream.created");
    compatCoverage.mark("claude", "responses.stream.delta");
    compatCoverage.mark("claude", "responses.stream.done");
    compatCoverage.mark("claude", "responses.stream.completed");
  });

  maybe("responses non-stream function_call", async () => {
    const client = buildProviderClient(
      provider,
      process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"
    );
    const params: ResponseCreateParams = {
      model: "gpt-4o-mini",
      input: "Call the echo tool with text='hi'",
      tools: [
        {
          type: "function",
          name: "echo",
          parameters: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          description: "echo text",
          strict: true,
        },
      ],
      tool_choice: { type: "function", name: "echo" },
    } as ResponseCreateParams;
    const res = await client.responses.create(params);
    function hasFunctionCall(output: any[]): boolean {
      return (
        Array.isArray(output) &&
        output.some(
          (i) => i?.type === "function_call" && typeof i?.name === "string"
        )
      );
    }
    expect(hasFunctionCall((res as any).output)).toBe(true);
    compatCoverage.mark("claude", "responses.non_stream.function_call");
  });

  maybe("responses stream function_call events", async () => {
    const client = buildProviderClient(
      provider,
      process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"
    );
    const params: ResponseCreateParams = {
      model: "gpt-4o-mini",
      input: "Call the echo tool with text='hello'",
      tools: [
        {
          type: "function",
          name: "echo",
          parameters: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          description: "echo text",
          strict: true,
        },
      ],
      tool_choice: { type: "function", name: "echo" },
      stream: true,
    } as ResponseCreateParams;
    const types: ResponseStreamEvent["type"][] = [];
    const stream = (await client.responses.create(
      params
    )) as AsyncIterable<ResponseStreamEvent>;
    for await (const ev of stream) types.push(ev.type);
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    compatCoverage.mark("claude", "responses.stream.function_call.added");
    compatCoverage.mark("claude", "responses.stream.function_call.args.delta");
    compatCoverage.mark("claude", "responses.stream.function_call.done");
  });

  maybe("models list basic", async () => {
    const client = buildProviderClient(
      provider,
      process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"
    );
    const res = await client.models.list();
    expect(Array.isArray(res.data)).toBe(true);
    expect(typeof res.data[0]?.id).toBe("string");
    compatCoverage.mark("claude", "models.list.basic");
  });

  // Chat (Claude-native) coverage
  async function pickClaudeModel() {
    const adapter = getAdapterFor(provider);
    const env = process.env.ANTHROPIC_MODEL;
    if (env) return env;
    try {
      const listed = await adapter.listModels();
      const ids = listed.data.map((m) => m.id);
      if (ids.length > 0) return ids[0];
    } catch {}
    return "claude-3-5-sonnet-20241022";
  }

  maybe("chat non-stream basic", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickClaudeModel();
    const input: ClaudeMessageCreateParams = {
      model,
      messages: [{ role: "user", content: "Hello from chat basic" }],
      stream: false,
      max_tokens: 64,
    };
    const raw = (await adapter.generate({ model, input })) as any;
    const out = claudeToOpenAIResponse(raw, model);
    expect(out.object).toBe("response");
    expect(Array.isArray(out.output)).toBe(true);
    compatCoverage.mark("claude", "responses.non_stream.basic");
    compatCoverage.mark("claude", "chat.non_stream.basic");
  });

  maybe("chat stream chunk + done", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickClaudeModel();
    const input: ClaudeMessageCreateParams = {
      model,
      messages: [{ role: "user", content: "Please stream a short reply" }],
      stream: true,
      max_tokens: 64,
    };
    const types: string[] = [];
    const s = adapter.stream!({ model, input });
    for await (const ev of claudeToOpenAIStream(
      s as AsyncIterable<any>,
      model
    )) {
      types.push(ev.type);
    }
    expect(types[0]).toBe("response.created");
    expect(types).toContain("response.output_text.delta");
    expect(types).toContain("response.output_text.done");
    expect(types[types.length - 1]).toBe("response.completed");
    compatCoverage.mark("claude", "responses.stream.created");
    compatCoverage.mark("claude", "responses.stream.delta");
    compatCoverage.mark("claude", "responses.stream.done");
    compatCoverage.mark("claude", "responses.stream.completed");
    compatCoverage.mark("claude", "chat.stream.chunk");
    compatCoverage.mark("claude", "chat.stream.done");
  });

  maybe("chat non-stream function_call", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickClaudeModel();
    const tools: ClaudeMessageCreateParams["tools"] = [
      {
        name: "echo",
        description: "Echo back text",
        input_schema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    ];
    const input: ClaudeMessageCreateParams = {
      model,
      messages: [{ role: "user", content: "Call echo with text='hi'" }],
      tools,
      tool_choice: { type: "tool", name: "echo" },
      stream: false,
      max_tokens: 64,
    };
    const raw = (await adapter.generate({ model, input })) as any;
    const out = claudeToOpenAIResponse(raw, model);
    const hasFn =
      Array.isArray(out.output) &&
      out.output.some((o) => o.type === "function_call");
    expect(hasFn).toBe(true);
    compatCoverage.mark("claude", "chat.non_stream.function_call");
    compatCoverage.mark("claude", "responses.non_stream.function_call");
  });

  maybe("chat stream tool_call delta", async () => {
    const adapter = getAdapterFor(provider);
    const model = await pickClaudeModel();
    const tools: ClaudeMessageCreateParams["tools"] = [
      {
        name: "echo",
        description: "Echo back text",
        input_schema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    ];
    const input: ClaudeMessageCreateParams = {
      model,
      messages: [{ role: "user", content: "Call echo with text='hello'" }],
      tools,
      tool_choice: { type: "tool", name: "echo" },
      stream: true,
      max_tokens: 64,
    };
    const types: string[] = [];
    const s = adapter.stream!({ model, input });
    for await (const ev of claudeToOpenAIStream(
      s as AsyncIterable<any>,
      model
    )) {
      const e: OpenAICompatStreamEvent = ev;
      types.push(e.type);
    }
    expect(types).toContain("response.output_item.added");
    expect(types).toContain("response.function_call_arguments.delta");
    expect(types).toContain("response.output_item.done");
    compatCoverage.mark("claude", "chat.stream.tool_call.delta");
    compatCoverage.mark("claude", "responses.stream.function_call.added");
    compatCoverage.mark("claude", "responses.stream.function_call.args.delta");
    compatCoverage.mark("claude", "responses.stream.function_call.done");
  });

  // Write provider-specific coverage report after tests
  afterAll(async () => {
    const report = {
      provider: "claude",
      generatedAt: new Date().toISOString(),
      ...compatCoverage.report("claude"),
    };
    await writeMarkdownReport(report);
  });
});
