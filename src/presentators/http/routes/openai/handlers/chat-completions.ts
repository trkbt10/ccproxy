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

    if (plan.type === "claude_json") {
      const body = await plan.getBody();
      return c.json(body);
    }

    if (plan.type === "claude_stream") {
      return streamSSE(c, async (sse) => {
        for await (const chunk of plan.stream) {
          await sse.writeSSE({ data: JSON.stringify(chunk) });
        }
        await sse.writeSSE({ data: "[DONE]" });
      });
    }

    // responses_processor: delegate to existing processor which handles SSE/JSON internally
    return plan.process(c);
  };
