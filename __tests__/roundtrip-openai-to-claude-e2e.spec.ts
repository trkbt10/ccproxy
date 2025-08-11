import { Hono } from "hono";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { createOpenAIRouter } from "../src/presentators/http/routes/openai/router";
import { createClaudeRouter } from "../src/presentators/http/routes/claude/router";
import type { RoutingConfig } from "../src/config/types";

function isRequest(input: Parameters<typeof fetch>[0]): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function getPathFromUrlish(urlish: string): string {
  try {
    const u = new URL(urlish);
    return u.pathname + (u.search || "");
  } catch {
    return urlish;
  }
}

function buildAppForOpenAItoClaude(cfg: RoutingConfig) {
  const app = new Hono();
  // Mount under /v1 to satisfy both SDKs
  app.route("/v1", createOpenAIRouter(cfg));
  app.route("/v1", createClaudeRouter(cfg));
  return app;
}

function makeInMemoryFetch(app: Hono, conversationId: string): typeof fetch {
  const core = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const method = isRequest(input) ? input.method : init?.method;
    const headers = new Headers(isRequest(input) ? input.headers : init?.headers);
    const body = isRequest(input) ? input.body : init?.body;
    headers.set("x-conversation-id", conversationId);

    const urlStr = isRequest(input)
      ? input.url
      : typeof input === "string"
      ? input
      : String(input);
    const path = getPathFromUrlish(urlStr);

    return app.request(path, { method: method || "GET", headers, body });
  };
  const impl = core as unknown as typeof fetch;
  (impl as any).preconnect = (globalThis.fetch as any)?.preconnect ?? ((_url: string) => {});
  return impl;
}

describe("E2E roundtrip: OpenAI Chat -> Proxy -> Claude", () => {
  it("produces function tool_calls via Claude conversion (non-stream)", async () => {
    // Configure router to use Claude provider internally and route all HTTP via in-memory fetch
    const cfg: RoutingConfig = {
      providers: {
        default: {
          type: "claude",
          apiKey: "test-key",
          baseURL: "http://local.test",
        },
      },
      defaults: { providerId: "default", model: "claude-3-5-sonnet-20241022" },
      tools: [],
    };

    const app = buildAppForOpenAItoClaude(cfg);
    const conversationId = `oaiclaude-${Date.now()}`;
    const fetchImpl = makeInMemoryFetch(app, conversationId);

    // Override global fetch for both OpenAI and Anthropic SDKs involved internally
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const client = new OpenAI({
        apiKey: "test-key",
        baseURL: "http://local.test/v1",
        // Headers to enable Responses API when used internally by our code paths
        defaultHeaders: { "OpenAI-Beta": "responses-2025-06-21" },
      });

      const tools: NonNullable<ChatCompletionCreateParams["tools"]> = [
        {
          type: "function",
          function: {
            name: "echo",
            description: "Echo back the provided text",
            parameters: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        },
      ];

      const resp: ChatCompletion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        stream: false,
        tools,
        tool_choice: { type: "function", function: { name: "echo" } },
        messages: [
          { role: "user", content: "Call the echo function with text='hello'." },
        ],
      });

      expect(resp).toBeTruthy();
      const choice = resp.choices[0];
      expect(choice).toBeTruthy();
      const toolCalls = choice.message.tool_calls;
      expect(Array.isArray(toolCalls) && toolCalls.length > 0).toBe(true);
      const first = toolCalls?.[0];
      if (first && first.type === "function") {
        expect(first.function.name).toBe("echo");
      } else {
        throw new Error("Expected first tool_call to be a function");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
