import { Hono } from "hono";
import type { ServerOptions } from "./server";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createClaudeRouter } from "./routes/claude/router";
import { createGlobalErrorHandler } from "./utils/global-error-handler";
import type { RoutingConfig } from "../../config/types";
import { getRoutingConfigPromise } from "./utils/config-loader";

// Claude app (Anthropic-compatible)
export function createClaudeApp(opts?: Pick<ServerOptions, "configPath" | "configOverrides">): Hono {
  const app = new Hono();

  // Global middlewares
  app.use("*", requestIdMiddleware);
  app.use("*", clientDisconnectMiddleware);
  app.use("*", corsMiddleware);

  // Global error handler
  app.onError(createGlobalErrorHandler("claude"));

  // Health
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Unified config loader
  const routingConfigPromise = getRoutingConfigPromise(opts);
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    // Claude API router mounted at root (Anthropic-compatible)
    const claudeRouter = createClaudeRouter(routingConfig);
    app.route("/", claudeRouter); // => /v1/messages, /v1/messages/count_tokens, etc.
  });

  return app;
}
