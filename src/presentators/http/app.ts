import { Hono } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { countTokens } from "./handlers/token-counter";
import { createResponseProcessor } from "./handlers/response-processor";
import { selectProviderForRequest } from "../../execution/tool-model-planner";
import { loadRoutingConfigOnce, buildProviderClient } from "../../execution/routing-config";
import { requestIdMiddleware } from "./middleware/request-id";
import { clientDisconnectMiddleware } from "./middleware/client-disconnect";
import { corsMiddleware } from "./middleware/cors";
import { createOpenAIRouter } from "../../routes/openai/router";
import type { RoutingConfig } from "../../config/types";
import { isErrorWithStatus } from "./utils/error-helpers";

export function createHonoApp(): Hono {
  // Note: environment validation is handled in routing-config dynamic synthesis

  const app = new Hono();

  // Global middlewares
  app.use("*", requestIdMiddleware);
  app.use("*", clientDisconnectMiddleware);
  app.use("*", corsMiddleware);

  // Global error handler
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

  // Health
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Root
  app.get("/", (c) => {
    return c.text("Claude to OpenAI Responses API Proxy");
  });

  const routingConfigPromise = loadRoutingConfigOnce();

  // Messages
  app.post("/v1/messages", async (c) => {
    const requestId = c.get("requestId");
    const abortController = c.get("abortController");
    const steinlessHelperMethod = c.req.header("x-stainless-helper-method");
    const stream = steinlessHelperMethod === "stream";
    console.log(`\n    🟢 [Request ${requestId}] new /v1/messages stream=${stream} at ${new Date().toISOString()}`);

    const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;

    const conversationId =
      c.req.header("x-conversation-id") ||
      c.req.header("x-session-id") ||
      requestId;

    console.log(
      `[Request ${requestId}] Incoming Claude Request (conversation: ${conversationId}):`,
      JSON.stringify(claudeReq, null, 2)
    );

    const routingConfig = await routingConfigPromise;
    const providerSelection = selectProviderForRequest(routingConfig, claudeReq);
    const provider = routingConfig.providers?.[providerSelection.providerId];
    if (!provider && providerSelection.providerId !== "default") {
      throw new Error(`Provider '${providerSelection.providerId}' not found`);
    }
    const openai = buildProviderClient(provider, providerSelection.model);

    const processor = createResponseProcessor({
      requestId,
      conversationId,
      openai,
      claudeReq,
      model: providerSelection.model,
      routingConfig,
      providerId: providerSelection.providerId,
      stream,
      signal: abortController.signal,
    });

    try {
      return await processor.process(c);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Request cancelled by client" || abortController.signal.aborted) {
        console.log(`[Request ${requestId}] Request was cancelled`);
        return c.text("Request cancelled", 499 as Parameters<typeof c.text>[1]);
      }
      throw error;
    }
  });

  // Token count
  app.post("/v1/messages/count_tokens", async (c) => {
    const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;
    const tokens = countTokens(claudeReq);
    return c.json({ input_tokens: tokens });
  });

  // OpenAI compatibility router mounted after config loads
  routingConfigPromise.then((routingConfig: RoutingConfig) => {
    const openaiRouter = createOpenAIRouter(routingConfig);
    app.route("/openai/api/v1", openaiRouter);
  });

  // Test connection endpoint (default provider)
  app.get("/test-connection", async (c) => {
    const routingConfig = await routingConfigPromise;
    const defaultProvider = routingConfig.providers?.["default"];
    if (!defaultProvider) {
      return c.json({ status: "error", message: "No default provider configured" }, 400);
    }
    const openai = buildProviderClient(defaultProvider);
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [{ role: "user", content: "Hello" }],
    });

    return c.json({ status: "ok", openai_connected: true, test_response: response });
  });

  return app;
}
