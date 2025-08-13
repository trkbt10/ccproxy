import { Hono } from "hono";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createOpenAIRouter } from "./routes/openai/router";
import type { RoutingConfig } from "../../config/types";
import { createGlobalErrorHandler } from "./utils/global-error-handler";

// OpenAI-compat focused Hono app
export function createOpenAIApp(): Hono {
  const app = new Hono();

  // Global middlewares
  app.use("*", requestIdMiddleware);
  app.use("*", clientDisconnectMiddleware);
  app.use("*", corsMiddleware);

  // Global error handler
  app.onError(createGlobalErrorHandler("openai"));

  // Health
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const routingConfigPromise = loadRoutingConfigOnce();
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    // OpenAI compatibility router mounted under /v1
    const openaiRouter = createOpenAIRouter(routingConfig);
    app.route("/v1", openaiRouter); // => /v1/chat/completions, /v1/models
  });

  return app;
}
