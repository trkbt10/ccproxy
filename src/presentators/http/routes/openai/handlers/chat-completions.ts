import type { Context } from "hono";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import Anthropic from "@anthropic-ai/sdk";
import { chatCompletionToClaude } from "../../../../../adapters/message-converter/openai-to-claude/chat-completion-request";
import { claudeToChatCompletion } from "../../../../../adapters/message-converter/claude-to-openai/chat-completion-response";
import { claudeEventToChatCompletionChunk } from "../../../../../adapters/message-converter/claude-to-openai/chat-completion-stream";
import { conversationStore } from "../../../../../utils/conversation/conversation-store";
import { streamSSE } from "hono/streaming";
import { selectProviderForRequest } from "../../../../../execution/tool-model-planner";
import { buildProviderClient } from "../../../../../execution/routing-config";
import { createResponseProcessor } from "../../../claude/handlers/response-processor";
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
    const idManager = conversationStore.getIdManager(conversationId);
    const claudeReq = chatCompletionToClaude(chatRequest, idManager);
    console.log(
      `[Request ${requestId}] Converted OpenAI Chat Completion to Claude (conversation: ${conversationId})`
    );

    const providerSelection = selectProviderForRequest(
      routingConfig,
      claudeReq
    );
    const provider = routingConfig.providers?.[providerSelection.providerId];
    if (!provider && providerSelection.providerId !== "default") {
      throw new Error(`Provider '${providerSelection.providerId}' not found`);
    }

    const providerType = provider?.type || "claude";
    if (providerType === "claude") {
      return handleClaudeProvider(c, {
        provider,
        claudeReq,
        chatRequest,
        idManager,
        stream,
        requestId,
        conversationId,
        abortController,
      });
    } else {
      return handleNonClaudeProvider(c, {
        provider,
        providerSelection,
        claudeReq,
        routingConfig,
        stream,
        requestId,
        conversationId,
        abortController,
      });
    }
  };

type ClaudeProviderParams = {
  provider: Provider | undefined;
  claudeReq: ClaudeMessageCreateParams;
  chatRequest: ChatCompletionCreateParams;
  idManager: UnifiedIdManager;
  stream: boolean;
  requestId: string;
  conversationId: string;
  abortController: AbortController;
};

async function handleClaudeProvider(c: Context, params: ClaudeProviderParams) {
  const {
    provider,
    claudeReq,
    chatRequest,
    idManager,
    stream,
    requestId,
    conversationId,
    abortController,
  } = params;
  const anthropic = new Anthropic({
    apiKey: provider?.apiKey,
    baseURL: provider?.baseURL,
  });

  if (stream) {
    return streamSSE(c, async (sseStream) => {
      const claudeStream = await anthropic.messages.create({
        ...claudeReq,
        stream: true,
      });
      for await (const event of claudeStream) {
        if (abortController.signal.aborted) {
          console.log(
            `[Request ${requestId}] Request aborted during streaming`
          );
          break;
        }
        const chunk = claudeEventToChatCompletionChunk(
          event,
          chatRequest.model,
          idManager
        );
        if (chunk) await sseStream.writeSSE({ data: JSON.stringify(chunk) });
      }
      await sseStream.writeSSE({ data: "[DONE]" });
    });
  } else {
    const claudeResponse = await anthropic.messages.create({
      ...claudeReq,
      stream: false,
    });
    const chatCompletion = claudeToChatCompletion(
      claudeResponse,
      chatRequest.model,
      idManager
    );
    conversationStore.updateConversationState({
      conversationId,
      requestId,
      responseId: chatCompletion.id,
    });
    return c.json(chatCompletion);
  }
}

type NonClaudeProviderParams = {
  provider: Provider | undefined;
  providerSelection: { providerId: string; model: string };
  claudeReq: ClaudeMessageCreateParams;
  routingConfig: RoutingConfig;
  stream: boolean;
  requestId: string;
  conversationId: string;
  abortController: AbortController;
};

async function handleNonClaudeProvider(
  c: Context,
  params: NonClaudeProviderParams
) {
  const {
    provider,
    providerSelection,
    claudeReq,
    routingConfig,
    stream,
    requestId,
    conversationId,
    abortController,
  } = params;
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
  return await processor.process(c);
}
