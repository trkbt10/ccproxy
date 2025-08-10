import { Hono } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { countTokens } from "./handlers/token-counter";
import { checkEnvironmentVariables } from "./config/environment";
import { createResponseProcessor } from "./handlers/response-processor";
import { selectProviderForRequest } from "./execution/tool-model-planner";
import { loadRoutingConfigOnce, buildProviderClient } from "./execution/routing-config";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";

// Bun automatically loads .env file, but we still check for required variables
checkEnvironmentVariables();

// OpenAI client is now constructed per-request based on routing config

const app = new Hono();

// Apply global middlewares
app.use("*", requestIdMiddleware);
app.use("*", clientDisconnectMiddleware);

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

const routingConfigPromise = loadRoutingConfigOnce();

// メッセージエンドポイント
app.post("/v1/messages", async (c) => {
  const requestId = c.get("requestId");
  const abortController = c.get("abortController");
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

  // Create and execute the appropriate processor with abort signal from middleware
  const routingConfig = await routingConfigPromise;

  const providerSelection = selectProviderForRequest(
    routingConfig,
    claudeReq,
    (name) => c.req.header(name) ?? null
  );

  const provider = routingConfig.providers?.[providerSelection.providerId];
  
  if (!provider && providerSelection.providerId !== "default") {
    throw new Error(`Provider '${providerSelection.providerId}' not found`);
  }

  // Build provider client for this request (supports API key switching)
  const openai = buildProviderClient(
    provider,
    (name) => c.req.header(name) ?? null,
    providerSelection.model
  );

  const processor = createResponseProcessor({
    requestId,
    conversationId,
    openai,
    claudeReq,
    model: providerSelection.model,
    routingConfig: routingConfig,
    providerId: providerSelection.providerId,
    stream,
    signal: abortController.signal, // Pass the abort signal
  });

  try {
    const response = await processor.process(c);
    return response;
  } catch (error) {
    // Handle aborted requests gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage === "Request cancelled by client" ||
      abortController.signal.aborted
    ) {
      console.log(`[Request ${requestId}] Request was cancelled`);
      return c.text("Request cancelled", 499 as Parameters<typeof c.text>[1]); // 499 Client Closed Request
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
  const routingConfig = await routingConfigPromise;
  // Use default provider for test connection
  const defaultProvider = routingConfig.providers?.["default"];
  const openai = buildProviderClient(
    defaultProvider,
    (name) => c.req.header(name) ?? null
  );
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
