import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { RoutingConfig } from "../../../../../config/types";
import { planChatCompletions } from "../plan-chat-completions";

// Safe helpers to extract optional fields from unknown errors
const getErrorStatus = (err: unknown): number | undefined => {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
};

const getErrorCode = (err: unknown): string | undefined => {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
};

export const createChatCompletionsHandler =
  (routingConfig: RoutingConfig) => async (c: Context) => {
    const requestId = c.get("requestId");
    const abortController = c.get("abortController");
    const chatRequest = (await c.req.json()) as ChatCompletionCreateParams;
    const stream = chatRequest.stream || false;
    console.log(
      `🟢 [Request ${requestId}] new /v1/chat/completions stream=${stream} at ${new Date().toISOString()}`
    );

    const conversationId =
      c.req.header("x-conversation-id") ||
      c.req.header("x-session-id") ||
      requestId;
    const plan = await planChatCompletions(routingConfig, chatRequest, {
      requestId,
      conversationId,
      abortController,
    });

    if (plan.type === "json") {
      const body = await plan.getBody();
      return c.json(body);
    }

    if (plan.type === "stream") {
      return streamSSE(c, async (sse) => {
        try {
          for await (const chunk of plan.stream) {
            await sse.writeSSE({ data: JSON.stringify(chunk) });
          }
        } catch (err) {
          const status = getErrorStatus(err);
          const message = err instanceof Error ? err.message : String(err);
          const code = getErrorCode(err);
          const type =
            code ||
            (status === 401
              ? "unauthorized"
              : status === 429
              ? "rate_limited"
              : status && status >= 500
              ? "upstream_error"
              : "api_error");
          try {
            await sse.writeSSE({
              event: "error",
              data: JSON.stringify({ error: { type, message } }),
            });
          } catch {}
          throw err;
        } finally {
          try {
            await sse.writeSSE({ data: "[DONE]" });
          } catch {}
        }
      });
    }

    // Fallback shouldn't happen; return 500 if it does
    return c.json({ error: "Plan type not supported" }, 500);
  };
