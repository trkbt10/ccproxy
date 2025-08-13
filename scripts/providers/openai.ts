import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { Response as OpenAIResponse, ResponseStreamEvent } from "openai/resources/responses/responses";
import { Line, Mode, ProviderFactory, ProviderInstance, NativeCase } from "./types";

function env(key: string, dflt?: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : dflt;
}

type OpenAIProvider = { type: "openai"; client: OpenAI; defaultHeaders?: Record<string, string> };

function buildProviderFromEnv(): OpenAIProvider | undefined {
  const defaultHeaders = { "OpenAI-Beta": "responses-2025-06-21" } as const;
  const apiKey = env("OPENAI_API_KEY") || env("OPENAI_KEY");
  if (!apiKey) return undefined;
  const client = new OpenAI({
    apiKey,
    baseURL: env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    defaultHeaders,
  });
  return { type: "openai", client, defaultHeaders };
}

export const factory: ProviderFactory = {
  name: "openai",
  defaultModel: "gpt-4o-mini",
  buildFromEnv(): ProviderInstance | undefined {
    const p = buildProviderFromEnv();
    if (!p) return undefined;
    return {
      name: "openai",
      defaultModel: "gpt-4o-mini",
      async nativeCases(model): Promise<NativeCase[]> {
        const ts = () => new Date().toISOString();
        const makeLineBase = (api: "chat" | "responses", mode: Mode, context: "basic" | "tool_call", request: unknown) => ({
          ts: ts(),
          provider: p.type,
          api,
          mode,
          context,
          request,
        });
        const tool = {
          type: "function" as const,
          function: {
            name: "get_current_time",
            description: "Get the current time in a location",
            parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
          },
        };
        return [
          {
            api: "chat",
            mode: "sync",
            context: "basic",
            buildRequest: () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Hello from mock generator" }];
              return { model, messages, stream: false } as ChatCompletionCreateParamsNonStreaming;
            },
            run: async () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Hello from mock generator" }];
              const request: ChatCompletionCreateParamsNonStreaming = { model, messages, stream: false };
              try {
                const resp = await p.client.chat.completions.create(request);
                return { ...makeLineBase("chat", "sync", "basic", request), response: resp } as Line;
              } catch (e) {
                return { ...makeLineBase("chat", "sync", "basic", request), error: { message: e instanceof Error ? e.message : String(e) } } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "stream",
            context: "basic",
            buildRequest: () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Hello from mock generator" }];
              return { model, messages, stream: true } as ChatCompletionCreateParamsStreaming;
            },
            run: async () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Hello from mock generator" }];
              const request: ChatCompletionCreateParamsStreaming = { model, messages, stream: true };
              const events: ChatCompletionChunk[] = [];
              try {
                const stream = await p.client.chat.completions.create(request);
                for await (const ch of stream) events.push(ch);
                return { ...makeLineBase("chat", "stream", "basic", request), events } as Line;
              } catch (e) {
                return { ...makeLineBase("chat", "stream", "basic", request), error: { message: e instanceof Error ? e.message : String(e) } } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "sync",
            context: "tool_call",
            buildRequest: () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Call the tool for time in Tokyo" }];
              return {
                model,
                messages,
                tools: [tool],
                tool_choice: { type: "function", function: { name: "get_current_time" } },
                stream: false,
              } as ChatCompletionCreateParamsNonStreaming;
            },
            run: async () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Call the tool for time in Tokyo" }];
              const request: ChatCompletionCreateParamsNonStreaming = {
                model,
                messages,
                tools: [tool],
                tool_choice: { type: "function", function: { name: "get_current_time" } },
                stream: false,
              };
              try {
                const resp = await p.client.chat.completions.create(request);
                return { ...makeLineBase("chat", "sync", "tool_call", request), response: resp } as Line;
              } catch (e) {
                return { ...makeLineBase("chat", "sync", "tool_call", request), error: { message: e instanceof Error ? e.message : String(e) } } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "stream",
            context: "tool_call",
            buildRequest: () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Call the tool for time in Tokyo" }];
              return {
                model,
                messages,
                tools: [tool],
                tool_choice: { type: "function", function: { name: "get_current_time" } },
                stream: true,
              } as ChatCompletionCreateParamsStreaming;
            },
            run: async () => {
              const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "Call the tool for time in Tokyo" }];
              const request: ChatCompletionCreateParamsStreaming = {
                model,
                messages,
                tools: [tool],
                tool_choice: { type: "function", function: { name: "get_current_time" } },
                stream: true,
              };
              const events: ChatCompletionChunk[] = [];
              try {
                const stream = await p.client.chat.completions.create(request);
                for await (const ch of stream) events.push(ch);
                return { ...makeLineBase("chat", "stream", "tool_call", request), events } as Line;
              } catch (e) {
                return { ...makeLineBase("chat", "stream", "tool_call", request), error: { message: e instanceof Error ? e.message : String(e) } } as Line;
              }
            },
          },
          {
            api: "responses",
            mode: "sync",
            context: "tool_call",
            buildRequest: () => ({
              model,
              input: [{ type: "message", role: "user", content: "Call the tool for time in Tokyo" }],
              tools: [
                { type: "function", name: "get_current_time", description: "Get the current time in a location", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] }, strict: true },
              ],
              tool_choice: { type: "function", name: "get_current_time" },
              stream: false,
            }),
            run: async () => {
              const request = {
                model,
                input: [{ type: "message" as const, role: "user" as const, content: "Call the tool for time in Tokyo" }],
                tools: [
                  { type: "function" as const, name: "get_current_time", description: "Get the current time in a location", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] }, strict: true },
                ],
                tool_choice: { type: "function" as const, name: "get_current_time" },
                stream: false as const,
              };
              try {
                const resp = await p.client.responses.create(request);
                return { ...makeLineBase("responses", "sync", "tool_call", request), response: resp } as Line;
              } catch (e) {
                return { ...makeLineBase("responses", "sync", "tool_call", request), error: { message: e instanceof Error ? e.message : String(e) } } as Line;
              }
            },
          },
          {
            api: "responses",
            mode: "stream",
            context: "tool_call",
            buildRequest: () => ({
              model,
              input: [{ type: "message", role: "user", content: "Call the tool for time in Tokyo" }],
              tools: [
                { type: "function", name: "get_current_time", description: "Get the current time in a location", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] }, strict: true },
              ],
              tool_choice: { type: "function", name: "get_current_time" },
              stream: true,
            }),
            run: async () => {
              const request = {
                model,
                input: [{ type: "message" as const, role: "user" as const, content: "Call the tool for time in Tokyo" }],
                tools: [
                  { type: "function" as const, name: "get_current_time", description: "Get the current time in a location", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] }, strict: true },
                ],
                tool_choice: { type: "function" as const, name: "get_current_time" },
                stream: true as const,
              };
              const events: ResponseStreamEvent[] = [];
              try {
                const stream = await p.client.responses.create(request);
                for await (const ev of stream) events.push(ev);
                return { ...makeLineBase("responses", "stream", "tool_call", request), events } as Line;
              } catch (e) {
                return { ...makeLineBase("responses", "stream", "tool_call", request), error: { message: e instanceof Error ? e.message : String(e) } } as Line;
              }
            },
          },
        ];
      },
    };
  },
};
