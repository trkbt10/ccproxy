import type { Context } from "hono";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { conversationStore } from "../../../../../utils/conversation/conversation-store";
import { streamSSE } from "hono/streaming";
import { planChatCompletions } from "../../../../../adapters/providers/openai-compat/chat-completions";
import type { RoutingConfig, Provider } from "../../../../../config/types";
import type { UnifiedIdManager } from "../../../../../utils/id-management/unified-id-manager";

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
          const status = (err as any)?.status ?? undefined;
          const message = err instanceof Error ? err.message : String(err);
          const code = (err as any)?.code as string | undefined;
          const type = code || (status === 401 ? 'unauthorized' : status === 429 ? 'rate_limited' : status && status >= 500 ? 'upstream_error' : 'api_error');
          try {
            await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: { type, message } }) });
          } catch {}
          throw err;
        } finally {
          try { await sse.writeSSE({ data: "[DONE]" }); } catch {}
        }
      });
    }

    // Fallback shouldn't happen; return 500 if it does
    return c.json({ error: "Plan type not supported" }, 500);
  };
