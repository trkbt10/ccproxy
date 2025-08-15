import { Hono } from "hono";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createOpenAIRouter } from "./routes/openai/router";
import type { RoutingConfig } from "../../config/types";
import { createGlobalErrorHandler } from "./utils/global-error-handler";
import type { ServerOptions } from "./server";
import { getRoutingConfigPromise } from "./utils/config-loader";

// OpenAI-compat focused Hono app
export function createOpenAIApp(opts?: Pick<ServerOptions, "configPath" | "configOverrides">): Hono {
  const app = new Hono();

  // Global middlewares
  app.use("*", requestIdMiddleware);
  app.use("*", clientDisconnectMiddleware);
  app.use("*", corsMiddleware);

  // Global error handler
  app.onError(createGlobalErrorHandler("openai"));
  app.notFound((c) => {
    console.warn("OpenAI route not found:", c.req.path);
    return c.json({ error: { message: "Not Found", type: "not_found" } }, 404);
  });

  // Health
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const routingConfigPromise = getRoutingConfigPromise(opts);
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    // Mount unified OpenAI router at root; it contains /v1/* and /api/tags
    const openaiRouter = createOpenAIRouter(routingConfig);
    app.route("/", openaiRouter);
  });

  return app;
}
