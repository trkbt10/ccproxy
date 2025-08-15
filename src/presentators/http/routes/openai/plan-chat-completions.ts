import type {
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type { RoutingConfig } from "../../../../config/types";
import { buildOpenAICompatibleClient } from "../../../../adapters/providers/openai-client";
import { extractToolNamesFromChat } from "../../../../execution/openai-tool-model-selector";
import { selectProvider } from "../../../../execution/provider-selection";

export type ChatCompletionsPlan =
  | { type: "json"; getBody: () => Promise<ChatCompletion> }
  | { type: "stream"; stream: AsyncIterable<ChatCompletionChunk> };

export type PlanOptions = {
  requestId: string;
  conversationId: string;
  abortController: AbortController;
};

export async function planChatCompletions(
  routingConfig: RoutingConfig,
  chatRequest: ChatCompletionCreateParams,
  opts: PlanOptions
): Promise<ChatCompletionsPlan> {
  const toolNames = extractToolNamesFromChat(chatRequest);
  const { providerId, model } = selectProvider(routingConfig, {
    explicitModel: chatRequest.model as string,
    toolNames,
    defaultModel: "gpt-4o-mini",
  });
  const provider = routingConfig.providers?.[providerId];
  if (!provider && providerId !== "default") {
    throw new Error(`Provider '${providerId}' not found`);
  }
  const openai = buildOpenAICompatibleClient(provider!, model);

  // Use provider's chat.completions implementation directly to preserve streaming tool_call deltas
  if (chatRequest.stream) {
    async function* iterator(): AsyncIterable<ChatCompletionChunk> {
      const stream = await openai.chat.completions.create(
        { ...chatRequest, model, stream: true },
        opts.abortController ? { signal: opts.abortController.signal } : undefined,
      );
      for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
        yield chunk;
      }
    }
    return { type: "stream", stream: iterator() };
  }

  async function getBody(): Promise<ChatCompletion> {
    const result = await openai.chat.completions.create(
      { ...chatRequest, model, stream: false },
      opts.abortController ? { signal: opts.abortController.signal } : undefined,
    );
    return result as ChatCompletion;
  }
  return { type: "json", getBody };
}
