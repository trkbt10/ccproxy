import type { Context } from "hono";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import Anthropic from "@anthropic-ai/sdk";
import { chatCompletionToClaude } from "../../../converters/message-converter/openai-to-claude/chat-completion-request";
import { claudeToChatCompletion } from "../../../converters/message-converter/claude-to-openai/chat-completion-response";
import { claudeEventToChatCompletionChunk } from "../../../converters/message-converter/claude-to-openai/chat-completion-stream";
import { conversationStore } from "../../../utils/conversation/conversation-store";
import { streamSSE } from "hono/streaming";
import { selectProviderForRequest } from "../../../execution/tool-model-planner";
import { buildProviderClient } from "../../../execution/routing-config";
import { createResponseProcessor } from "../../../handlers/response-processor";
import type { RoutingConfig, Provider } from "../../../config/types";
import type { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";

export const createChatCompletionsHandler = (routingConfig: RoutingConfig) => async (c: Context) => {
  const requestId = c.get("requestId");
  const abortController = c.get("abortController");
  
  const chatRequest = await c.req.json() as ChatCompletionCreateParams;
  const stream = chatRequest.stream || false;
  
  console.log(`🟢 [Request ${requestId}] new /v1/chat/completions stream=${stream} at ${new Date().toISOString()}`);

  // Extract conversation ID
  const conversationId =
    c.req.header("x-conversation-id") ||
    c.req.header("x-session-id") ||
    requestId;

  // Get ID manager for this conversation
  const idManager = conversationStore.getIdManager(conversationId);
  
  // Convert to Claude format
  const claudeReq = chatCompletionToClaude(chatRequest, idManager);
  
  console.log(
    `[Request ${requestId}] Converted OpenAI Chat Completion to Claude (conversation: ${conversationId})`
  );

  // Select provider based on the passed routing config
  const providerSelection = selectProviderForRequest(
    routingConfig,
    claudeReq,
    (name) => c.req.header(name) ?? null
  );

  const provider = routingConfig.providers?.[providerSelection.providerId];
  
  if (!provider && providerSelection.providerId !== "default") {
    throw new Error(`Provider '${providerSelection.providerId}' not found`);
  }

  // Check if this is a Claude provider
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
      abortController
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
      abortController
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
  const { provider, claudeReq, chatRequest, idManager, stream, requestId, conversationId, abortController } = params;
  
  // Direct Claude API call
  const anthropic = new Anthropic({
    apiKey: provider?.apiKey || process.env.ANTHROPIC_API_KEY,
    baseURL: provider?.baseURL,
  });

  if (stream) {
    // Streaming response
    return streamSSE(c, async (sseStream) => {
      const claudeStream = await anthropic.messages.create({
        ...claudeReq,
        stream: true,
      });

      for await (const event of claudeStream) {
        // Check for abort
        if (abortController.signal.aborted) {
          console.log(`[Request ${requestId}] Request aborted during streaming`);
          break;
        }

        const chunk = claudeEventToChatCompletionChunk(event, chatRequest.model, idManager);
        if (chunk) {
          await sseStream.writeSSE({ data: JSON.stringify(chunk) });
        }
      }

      await sseStream.writeSSE({ data: "[DONE]" });
    });
  } else {
    // Non-streaming response
    const claudeResponse = await anthropic.messages.create({
      ...claudeReq,
      stream: false
    });
    const chatCompletion = claudeToChatCompletion(claudeResponse, chatRequest.model, idManager);
    
    // Store response ID for conversation continuity
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

async function handleNonClaudeProvider(c: Context, params: NonClaudeProviderParams) {
  const { provider, providerSelection, claudeReq, routingConfig, stream, requestId, conversationId, abortController } = params;
  
  // For non-Claude providers (Gemini, Grok), use the existing response processor
  const openai = buildProviderClient(
    provider,
    (name) => c.req.header(name) ?? null,
    providerSelection.model
  );

  const processor = createResponseProcessor({
    requestId,
    conversationId,
    openai,
    claudeReq,
    model: providerSelection.model,
    routingConfig: routingConfig,
    providerId: providerSelection.providerId,
    stream,
    signal: abortController.signal,
  });

  // Process the request (returns Claude format)
  const response = await processor.process(c);
  
  // Note: For full OpenAI compatibility with non-Claude providers,
  // you would need to convert the Claude response back to OpenAI format.
  // For now, this returns the Claude format response.
  return response;
}