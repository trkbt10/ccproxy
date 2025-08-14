import { Hono } from "hono";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import type { ServerOptions } from "./server";
import { createConfigLoader } from "../../execution/routing-config-with-overrides";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createClaudeRouter } from "./routes/claude/router";
import { createGlobalErrorHandler } from "./utils/global-error-handler";
import type { RoutingConfig } from "../../config/types";

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

  // Use custom config loader if options provided
  const loadConfig =
    opts?.configPath || opts?.configOverrides
      ? createConfigLoader(opts.configPath, opts.configOverrides)
      : loadRoutingConfigOnce;
  const routingConfigPromise = loadConfig();
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    // Claude API router mounted at root (Anthropic-compatible)
    const claudeRouter = createClaudeRouter(routingConfig);
    app.route("/", claudeRouter); // => /v1/messages, /v1/messages/count_tokens, etc.
  });

  return app;
}
