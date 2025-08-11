import { Hono } from "hono";
import type { RoutingConfig } from "../../../../config/types";
import { createChatCompletionsHandler } from "./handlers/chat-completions";
import { modelsHandler } from "./handlers/models";
import { isErrorWithStatus } from "../../utils/error-helpers";

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
    return c.json({ error: { type: "api_error", message: err instanceof Error ? err.message : "Internal server error" } }, status as Parameters<typeof c.json>[1]);
  });

  openaiRouter.post("/chat/completions", createChatCompletionsHandler(routingConfig));
  openaiRouter.get("/models", modelsHandler);
  return openaiRouter;
};

