import Anthropic from "@anthropic-ai/sdk";
import type {
  Message as ClaudeMessage,
  MessageStreamEvent,
  MessageCreateParams as ClaudeMessageParams,
} from "@anthropic-ai/sdk/resources/messages";
import { Line, Mode, ProviderFactory, ProviderInstance, NativeCase } from "./types";

function env(key: string, dflt?: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : dflt;
}

type ClaudeProvider = { type: "claude"; client: Anthropic };

function buildProviderFromEnv(): ClaudeProvider | undefined {
  const apiKey = env("CLAUDE_API_KEY") || env("ANTHROPIC_API_KEY");
  if (!apiKey) return undefined;
  const client = new Anthropic({ apiKey, baseURL: env("CLAUDE_BASE_URL") });
  return { type: "claude", client };
}

// selectModel is intentionally omitted to avoid indirection; use defaultModel

export const factory: ProviderFactory = {
  name: "claude",
  defaultModel: "claude-sonnet-4-20250514",
  buildFromEnv(): ProviderInstance | undefined {
    const p = buildProviderFromEnv();
    if (!p) return undefined;
    return {
      name: "claude",
      defaultModel: "claude-sonnet-4-20250514",
      async nativeCases(model): Promise<NativeCase[]> {
        const ts = () => new Date().toISOString();
        const makeLineBase = (
          api: "chat" | "responses",
          mode: Mode,
          context: "basic" | "tool_call",
          request: unknown
        ) => ({
          ts: ts(),
          provider: p.type,
          api,
          mode,
          context,
          request,
        });
        const tool = {
          name: "get_current_time",
          description: "Get the current time in a location",
          input_schema: {
            type: "object" as const,
            properties: { location: { type: "string" as const } },
            required: ["location"] as string[],
          },
        };
        return [
          {
            api: "chat",
            mode: "sync",
            context: "basic",
            buildRequest: () =>
              ({
                model,
                messages: [{ role: "user", content: "Hello from mock generator" }],
                max_tokens: 1024,
                stream: false,
              } satisfies ClaudeMessageParams),
            run: async () => {
              const request: ClaudeMessageParams = {
                model,
                messages: [{ role: "user", content: "Hello from mock generator" }],
                max_tokens: 1024,
                stream: false,
              };
              try {
                const resp = (await p.client.messages.create(request)) as ClaudeMessage;
                return { ...makeLineBase("chat", "sync", "basic", request), response: resp } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "sync", "basic", request),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "stream",
            context: "basic",
            buildRequest: () =>
              ({
                model,
                messages: [{ role: "user", content: "Hello from mock generator" }],
                max_tokens: 1024,
                stream: true,
              } satisfies ClaudeMessageParams),
            run: async () => {
              const request: ClaudeMessageParams = {
                model,
                messages: [{ role: "user", content: "Hello from mock generator" }],
                max_tokens: 1024,
                stream: true,
              };
              const events: MessageStreamEvent[] = [];
              try {
                const stream = (await p.client.messages.create(
                  request
                )) as unknown as AsyncIterable<MessageStreamEvent>;
                for await (const ev of stream) events.push(ev);
                return { ...makeLineBase("chat", "stream", "basic", request), events } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "stream", "basic", request),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "sync",
            context: "tool_call",
            buildRequest: () =>
              ({
                model,
                messages: [{ role: "user", content: "Call the tool for time in Tokyo" }],
                max_tokens: 1024,
                tools: [tool],
                tool_choice: { type: "tool", name: "get_current_time" },
                stream: false,
              } satisfies ClaudeMessageParams),
            run: async () => {
              const request: ClaudeMessageParams = {
                model,
                messages: [{ role: "user", content: "Call the tool for time in Tokyo" }],
                max_tokens: 1024,
                tools: [tool],
                tool_choice: { type: "tool", name: "get_current_time" },
                stream: false,
              };
              try {
                const resp = (await p.client.messages.create(request)) as ClaudeMessage;
                return { ...makeLineBase("chat", "sync", "tool_call", request), response: resp } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "sync", "tool_call", request),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "stream",
            context: "tool_call",
            buildRequest: () =>
              ({
                model,
                messages: [{ role: "user", content: "Call the tool for time in Tokyo" }],
                max_tokens: 1024,
                tools: [tool],
                tool_choice: { type: "tool", name: "get_current_time" },
                stream: true,
              } satisfies ClaudeMessageParams),
            run: async () => {
              const request: ClaudeMessageParams = {
                model,
                messages: [{ role: "user", content: "Call the tool for time in Tokyo" }],
                max_tokens: 1024,
                tools: [tool],
                tool_choice: { type: "tool", name: "get_current_time" },
                stream: true,
              };
              const events: MessageStreamEvent[] = [];
              try {
                const stream = (await p.client.messages.create(
                  request
                )) as unknown as AsyncIterable<MessageStreamEvent>;
                for await (const ev of stream) events.push(ev);
                return { ...makeLineBase("chat", "stream", "tool_call", request), events } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "stream", "tool_call", request),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
        ];
      },
    };
  },
};
