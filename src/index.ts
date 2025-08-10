import { Hono } from "hono";
import OpenAI from "openai";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { countTokens } from "./handlers/token-counter";
import { checkEnvironmentVariables } from "./config/environment";
import { createResponseProcessor } from "./handlers/response-processor";
import { resolveModel } from "./config/model-router";

// Bun automatically loads .env file, but we still check for required variables
checkEnvironmentVariables();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  defaultHeaders: {
    "OpenAI-Beta": "responses-2025-06-21",
  },
});

const app = new Hono();

// Type guard for error with status
function isErrorWithStatus(err: unknown): err is Error & { status: number } {
  return (
    err instanceof Error &&
    "status" in err &&
    typeof (err as Error & { status: unknown }).status === "number"
  );
}

// グローバルエラーハンドラー
app.onError((err, c) => {
  console.error("Global error handler:", err);
  const status = isErrorWithStatus(err) ? err.status : 500;
  return c.json(
    {
      type: "error",
      error: {
        type: "api_error",
        message: err.message || "Internal server error",
      },
    },
    status as Parameters<typeof c.json>[1]
  );
});

// CORS設定
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  if (c.req.method === "OPTIONS") {
    return c.status(204); // 204 No Content for preflight requests
  }

  await next();
});

// ヘルスチェック
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (c) => {
  return c.text("Claude to OpenAI Responses API Proxy");
});

// メッセージエンドポイント
app.post("/v1/messages", async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  const steinlessHelperMethod = c.req.header("x-stainless-helper-method");
  const stream = steinlessHelperMethod === "stream";
  console.log(`
    🟢 [Request ${requestId}] new /v1/messages stream=${stream} at ${new Date().toISOString()}`);

  const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;

  // Extract conversation ID from headers or generate one
  const conversationId =
    c.req.header("x-conversation-id") ||
    c.req.header("x-session-id") ||
    requestId; // Use request ID as fallback

  // Log the incoming Claude request to understand the flow
  console.log(
    `[Request ${requestId}] Incoming Claude Request (conversation: ${conversationId}):`,
    JSON.stringify(claudeReq, null, 2)
  );

  // Create an AbortController for this request
  const abortController = new AbortController();
  
  // Optional: Set a timeout for the request (configurable via environment variable)
  const timeoutMs = process.env.REQUEST_TIMEOUT_MS ? parseInt(process.env.REQUEST_TIMEOUT_MS) : 0;
  let timeoutId: NodeJS.Timeout | undefined;
  
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      console.log(`[Request ${requestId}] Request timeout after ${timeoutMs}ms`);
      abortController.abort();
    }, timeoutMs);
  }
  
  // Set up client disconnect detection
  // In Hono, we can detect if the client disconnects by checking the request's raw object
  const req = c.req.raw;
  
  // Handle client disconnect (works in Node.js environments)
  // Type guard for Node.js request with event emitter
  interface NodeRequest extends Request {
    on?(event: string, listener: () => void): void;
    complete?: boolean;
  }
  
  const nodeReq = req as NodeRequest;
  if (nodeReq.on && typeof nodeReq.on === 'function') {
    nodeReq.on('close', () => {
      if (!nodeReq.complete) {
        console.log(`[Request ${requestId}] Client disconnected, aborting OpenAI request`);
        abortController.abort();
        if (timeoutId) clearTimeout(timeoutId);
      }
    });
  }
  
  // For environments where the request doesn't have event emitters,
  // we can also check the abort signal from the request itself if available
  // Note: We can't extend Request interface, so we just cast and check
  const reqWithSignal = req as Request & { signal?: AbortSignal };
  if (reqWithSignal.signal && reqWithSignal.signal instanceof AbortSignal) {
    reqWithSignal.signal.addEventListener('abort', () => {
      console.log(`[Request ${requestId}] Request aborted by client`);
      abortController.abort();
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  // Create and execute the appropriate processor with abort signal
  const resolvedModel = resolveModel(claudeReq, (name) => c.req.header(name) ?? null);

  const processor = createResponseProcessor({
    requestId,
    conversationId,
    openai,
    claudeReq,
    modelResolver: (model) => {
      // Ignore Claude-provided model and use our router decision
      return resolvedModel;
    },
    stream,
    signal: abortController.signal, // Pass the abort signal
  });

  try {
    const response = await processor.process(c);
    // Clear timeout if request completes successfully
    if (timeoutId) clearTimeout(timeoutId);
    return response;
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) clearTimeout(timeoutId);
    
    // Handle aborted requests gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Request cancelled by client' || abortController.signal.aborted) {
      console.log(`[Request ${requestId}] Request was cancelled`);
      return c.text('Request cancelled', 499 as Parameters<typeof c.text>[1]); // 499 Client Closed Request
    }
    throw error;
  }
});

// トークンカウントエンドポイント
app.post("/v1/messages/count_tokens", async (c) => {
  const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;
  const tokens = countTokens(claudeReq);
  return c.json({ input_tokens: tokens });
});

// テスト接続エンドポイント
app.get("/test-connection", async (c) => {
  // OpenAI APIの簡単なテスト
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: "Hello",
      },
    ],
  });

  return c.json({
    status: "ok",
    openai_connected: true,
    test_response: response,
  });
});

export default app;
