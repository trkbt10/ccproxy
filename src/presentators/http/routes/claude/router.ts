import { Hono } from "hono";
import type { RoutingConfig } from "../../../../config/types";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { countTokens } from "./handlers/token-counter";
import { selectProviderForRequest } from "../../../../execution/tool-model-planner";
import { buildProviderClient } from "../../../../execution/routing-config";
import { createResponseProcessor } from "./handlers/response-processor";

export function createClaudeRouter(routingConfig: RoutingConfig) {
  const router = new Hono();

  // Root banner text
  router.get("/", (c) => c.text("Claude to OpenAI Responses API Proxy"));

  // Messages endpoint
  router.post("/v1/messages", async (c) => {
    const requestId = c.get("requestId");
    const abortController = c.get("abortController");
    const method = c.req.header("x-stainless-helper-method");
    const stream = method === "stream";
    console.log(`\n    🟢 [Request ${requestId}] new /v1/messages stream=${stream} at ${new Date().toISOString()}`);

    const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;
    const conversationId = c.req.header("x-conversation-id") || c.req.header("x-session-id") || requestId;
    console.log(`[Request ${requestId}] Incoming Claude Request (conversation: ${conversationId}):`, JSON.stringify(claudeReq, null, 2));

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

  // Token count endpoint
  router.post("/v1/messages/count_tokens", async (c) => {
    const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;
    const tokens = countTokens(claudeReq);
    return c.json({ input_tokens: tokens });
  });

  // Test connection endpoint using default provider
  router.get("/test-connection", async (c) => {
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

  return router;
}
