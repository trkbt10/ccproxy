import { Hono } from "hono";
import type { RoutingConfig } from "../../../../config/types";
import { createModelActionHandler } from "./handlers/model-action";
import { createModelsHandler } from "./handlers/models";
import { isErrorWithStatus } from "../../utils/error-helpers";
import { toErrorBody } from "../../../../adapters/errors/error-converter";

export const createGeminiRouter = (routingConfig: RoutingConfig) => {
  const geminiRouter = new Hono();
  
  geminiRouter.onError((err, c) => {
    const requestId = c.get("requestId") || "unknown";
    if (err instanceof Error && (err.message === "Request cancelled by client" || err.name === "AbortError")) {
      console.log(`[Request ${requestId}] Request was cancelled`);
      return c.text("Request cancelled", 499 as Parameters<typeof c.text>[1]);
    }
    console.error(`[Request ${requestId}] Gemini route error:`, err);
    const status = isErrorWithStatus(err) ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    const code = (err as { code?: unknown })?.code;
    const type = typeof code === 'string' && code.trim()
      ? String(code)
      : (status === 401 ? 'unauthorized'
        : status === 403 ? 'forbidden'
        : status === 404 ? 'not_found'
        : status === 429 ? 'rate_limited'
        : status >= 500 ? 'upstream_error'
        : status >= 400 ? 'bad_request'
        : 'api_error');
    
    // Gemini-style error response
    return c.json({
      error: {
        code: status,
        message: message,
        status: type.toUpperCase()
      }
    }, status as Parameters<typeof c.json>[1]);
  });

  // Gemini API endpoints using wildcard pattern with manual parsing
  geminiRouter.post("/v1beta/models/*", createModelActionHandler(routingConfig));
  geminiRouter.post("/v1/models/*", createModelActionHandler(routingConfig));
  
  // Models endpoint
  geminiRouter.get("/v1beta/models", createModelsHandler(routingConfig));
  geminiRouter.get("/v1/models", createModelsHandler(routingConfig));
  
  return geminiRouter;
};