import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { Hono } from "hono";
import type { RoutingConfig } from "../../../../config/types";
import { selectProviderForRequest } from "../../../../execution/tool-model-planner";
import { createResponseProcessor } from "./handlers/response-processor";
import { countTokens } from "./handlers/token-counter";
import { buildOpenAICompatibleClient } from "../../../../adapters/providers/openai-client";

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
    const claudeReq = (await c.req.json()) as ClaudeMessageCreateParams;

    const providerSelection = selectProviderForRequest(routingConfig, claudeReq);
    const provider = routingConfig.providers?.[providerSelection.providerId];
    if (!provider) {
      throw new Error(`Provider '${providerSelection.providerId}' not found`);
    }
    const openai = buildOpenAICompatibleClient(provider);
    const processor = createResponseProcessor({
      requestId,
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

  return router;
}
