// OpenAI-focused server entry that also mounts Claude routes
// This allows round-trip via OpenAI client -> proxy -> Claude internally.
import { Hono } from "hono";
import { requestIdMiddleware } from "./presentators/http/middleware/request-id";
import { clientDisconnectMiddleware } from "./presentators/http/middleware/client-disconnect";
import { corsMiddleware } from "./presentators/http/middleware/cors";
import { createGlobalErrorHandler } from "./presentators/http/utils/global-error-handler";
import { loadRoutingConfigOnce } from "./execution/routing-config";
import type { RoutingConfig } from "./config/types";
import { createOpenAIRouter } from "./presentators/http/routes/openai/router";
import { createClaudeRouter } from "./presentators/http/routes/claude/router";
import { startHonoServer } from "./presentators/http/server";

const app = new Hono();

// Global middlewares
app.use("*", requestIdMiddleware);
app.use("*", clientDisconnectMiddleware);
app.use("*", corsMiddleware);

// Global error handler (OpenAI-style JSON)
app.onError(createGlobalErrorHandler("openai"));

// Health
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Load routing config then mount routers under /v1
const routingConfigPromise = loadRoutingConfigOnce();
routingConfigPromise.then((routingConfig: RoutingConfig) => {
  const openaiRouter = createOpenAIRouter(routingConfig);
  const claudeRouter = createClaudeRouter(routingConfig);
  app.route("/v1", openaiRouter); // /v1/chat/completions, /v1/models
  app.route("/v1", claudeRouter); // /v1/messages, /v1/messages/count_tokens
});

await startHonoServer(app, { apiMode: "openai" });

