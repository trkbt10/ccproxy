import { Hono } from "hono";
import type { RoutingConfig } from "../../../../config/types";
import { createChatCompletionsHandler } from "./handlers/chat-completions";
import { createModelsHandler } from "./handlers/models";
import { createResponsesHandler } from "./handlers/responses";
import { createTagsHandler } from "./handlers/tags";
import { isErrorWithStatus } from "../../utils/error-helpers";
import { toErrorBody } from "../../../../adapters/errors/error-converter";

export const createOpenAIRouter = (routingConfig: RoutingConfig) => {
  const openaiRouter = new Hono();
  openaiRouter.onError((err, c) => {
    const requestId = c.get("requestId") || "unknown";
    if (err instanceof Error && (err.message === "Request cancelled by client" || err.name === "AbortError")) {
      console.log(`[Request ${requestId}] Request was cancelled`);
      return c.text("Request cancelled", 499 as Parameters<typeof c.text>[1]);
    }
    console.error(`[Request ${requestId}] OpenAI route error:`, err);
    const status = isErrorWithStatus(err) ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    const code = (err as { code?: unknown })?.code;
    const type =
      typeof code === "string" && code.trim()
        ? String(code)
        : status === 401
        ? "unauthorized"
        : status === 403
        ? "forbidden"
        : status === 404
        ? "not_found"
        : status === 429
        ? "rate_limited"
        : status >= 500
        ? "upstream_error"
        : status >= 400
        ? "bad_request"
        : "api_error";
    return c.json(toErrorBody("openai", message, type) as never, status as Parameters<typeof c.json>[1]);
  });

  // Unified routes: include /v1 prefix here and tags endpoint
  openaiRouter.post("/v1/chat/completions", createChatCompletionsHandler(routingConfig));
  openaiRouter.post("/v1/responses", createResponsesHandler(routingConfig));
  openaiRouter.get("/v1/models", createModelsHandler(routingConfig));
  openaiRouter.get("/api/tags", createTagsHandler(routingConfig));
  return openaiRouter;
};
