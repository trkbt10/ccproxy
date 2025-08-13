import { Hono } from "hono";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createGeminiRouter } from "./routes/gemini/router";
import type { RoutingConfig } from "../../config/types";
import { createGlobalErrorHandler } from "./utils/global-error-handler";

// Gemini-compat focused Hono app
export function createGeminiApp(): Hono {
  const app = new Hono();

  // Global middlewares
  app.use("*", requestIdMiddleware);
  app.use("*", clientDisconnectMiddleware);
  app.use("*", corsMiddleware);

  // Global error handler
  app.onError(createGlobalErrorHandler("gemini"));

  // Health
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const routingConfigPromise = loadRoutingConfigOnce();
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    // Gemini compatibility router mounted at root
    const geminiRouter = createGeminiRouter(routingConfig);
    app.route("/", geminiRouter); // => /v1beta/models/*, /v1/models/*
  });

  return app;
}