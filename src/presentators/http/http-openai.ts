import { Hono } from "hono";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createOpenAIRouter } from "./routes/openai/router";
import type { RoutingConfig } from "../../config/types";
import { createGlobalErrorHandler } from "./utils/global-error-handler";
import type { ServerOptions } from "./server";
import { createConfigLoader } from "../../execution/routing-config-with-overrides";
import { buildOpenAICompatibleClient } from "../../adapters/providers/openai-client";
import { selectProviderForRequest } from "../../execution/tool-model-planner";
import { selectProviderForOpenAI } from "../../execution/openai-tool-model-selector";

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

  const routingConfigPromise =
    opts?.configPath || opts?.configOverrides
      ? createConfigLoader(opts.configPath, opts.configOverrides)()
      : loadRoutingConfigOnce();
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    // Ollama like endpoints
    app.get("/api/tags", async (c) => {
      const requestId = c.get("requestId");
      const method = c.req.header("x-stainless-helper-method");
      const stream = method === "stream";
      console.log(`\n    🟢 [Request ${requestId}] new /v1/messages stream=${stream} at ${new Date().toISOString()}`);

      const { providerId, model } = selectProviderForOpenAI(routingConfig, { model: "anything", toolNames: [] });
      const provider = routingConfig.providers?.[providerId];
      if (!provider) {
        throw new Error(`Provider '${providerId}' not found`);
      }
      if (!provider) {
        return c.json({ tags: [] });
      }
      const client = buildOpenAICompatibleClient(provider);
      const models = await client.models.list();
      return c.json({
        models: models.data.map((tag) => ({
          name: tag.id,
          model: tag.id,
          modified_at: new Date(tag.created * 1000).toISOString(),
          size: 0,
          digest: tag.id, // Assuming id is used as digest
          details: {
            parent_model: "",
            format: "openai", // Assuming OpenAI format
            family: "openai",
            families: ["openai"],
            parameter_size: "unknown",
            quantization_level: "unknown",
          },
        })),
      });
    });
    // OpenAI compatibility router mounted under /v1
    const openaiRouter = createOpenAIRouter(routingConfig);

    app.route("/v1", openaiRouter); // => /v1/chat/completions, /v1/models
  });

  return app;
}
