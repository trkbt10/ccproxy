import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam as ClaudeMessageParam,
  Tool as ClaudeTool,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
import { createClaudeRouter } from "../src/presentators/http/routes/claude/router";
import { loadRoutingConfigOnce } from "../src/execution/routing-config";
import { conversationStore } from "../src/utils/conversation/conversation-store";

function isRequest(input: Parameters<typeof fetch>[0]): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function getPathFromUrlish(urlish: string): string {
  try {
    const u = new URL(urlish);
    return u.pathname + (u.search || "");
  } catch {
    // Relative path like "/v1/messages"
    return urlish;
  }
}

function buildAppForClaudeRoute() {
  const app = new Hono();
  return loadRoutingConfigOnce().then((cfg) => {
    app.route("/", createClaudeRouter(cfg));
    return app;
  });
}

// In-memory fetch that dispatches to the Hono app
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

    const res = await app.request(path, {
      method: method || "GET",
      headers,
      body,
    });
    return res;
  };
  const impl = core as unknown as typeof fetch;
  // Provide preconnect to satisfy Bun's typing
  (impl as any).preconnect = (globalThis.fetch as any)?.preconnect ?? ((_url: string) => {});
  return impl;
}

describe("E2E roundtrip: Claude SDK -> Proxy -> OpenAI (Responses)", () => {
  it("streams and records tool_call mapping", async () => {
    if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_KEY) {
      throw new Error(
        "OPENAI_API_KEY not set. Provide a real key to run this E2E test."
      );
    }

    const app = await buildAppForClaudeRoute();
    const conversationId = `rt-e2e-${Date.now()}`;
    const fetchImpl = makeInMemoryFetch(app, conversationId);

    const client = new Anthropic({
      apiKey: "test-key",
      baseURL: "http://local.test",
      fetch: fetchImpl,
    });

    const tools: ClaudeTool[] = [
      {
        name: "echo",
        description: "Echo back the provided text",
        input_schema: {
          type: "object",
          properties: {
            text: { type: "string", description: "text to echo" },
          },
          required: ["text"],
        },
      },
    ];

    const messages: ClaudeMessageParam[] = [
      {
        role: "user",
        content: "Call the echo tool with text='hello' and then stop.",
      },
    ];

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 64,
      tools,
      tool_choice: { type: "tool", name: "echo" },
      messages,
    });

    const seenEvents: RawMessageStreamEvent["type"][] = [];
    const toolUseIds: string[] = [];
    stream.on("streamEvent", (e: RawMessageStreamEvent) => {
      seenEvents.push(e.type);
      if (e.type === "content_block_start") {
        const block = e.content_block;
        if (block.type === "tool_use") {
          toolUseIds.push(block.id);
        }
      }
    });

    const rs = stream.toReadableStream();
    const reader = rs.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(seenEvents.length).toBeGreaterThan(0);
    expect(seenEvents).toContain("message_start");
    expect(seenEvents).toContain("message_stop");

    if (toolUseIds.length > 0) {
      const idManager = conversationStore.getIdManager(conversationId);
      const openaiId = idManager.getOpenAICallId(toolUseIds[0]);
      expect(typeof openaiId === "string").toBe(true);
    }
  });
});
