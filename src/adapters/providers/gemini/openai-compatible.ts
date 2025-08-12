import type { Provider } from "../../../config/types";
import { getAdapterFor } from "../registry";
import type {
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-compat/types";
import type { GenerateContentRequest } from "./fetch-client";
import { ensureGeminiStream, isGeminiResponse } from "../gemini/guards";
import { responsesToGeminiRequest } from "./request";
import { geminiToOpenAIStream } from "./openai-stream-adapter";
import { geminiToOpenAIResponse } from "./openai-response-adapter";
import { conversationStore } from "../../../utils/conversation/conversation-store";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { resolveModelForProvider } from "../shared/model-mapper";

// conversion logic moved to converters/providers/gemini/request

export function buildOpenAICompatibleClientForGemini(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const adapter = getAdapterFor(provider, modelHint);
  let resolveToolName: ((callId: string) => string | undefined) | undefined;
  let boundConversationId: string | undefined;
  const getIdManager = (): UnifiedIdManager | undefined =>
    boundConversationId ? conversationStore.getIdManager(boundConversationId) : undefined;
  return {
    responses: {
      async create(
        params: ResponseCreateParams,
        options?: { signal?: AbortSignal }
      ): Promise<any> {
        const model = await resolveModelForProvider({
          provider,
          sourceModel: (params as { model?: string }).model || (modelHint as string | undefined),
          modelHint,
        });
        const body = responsesToGeminiRequest(params, resolveToolName);
        if ("stream" in params && params.stream === true) {
          if (!adapter.stream)
            throw new Error("Gemini adapter does not support streaming");
          const stream = adapter.stream({
            model,
            input: body,
            signal: options?.signal,
          });
          return geminiToOpenAIStream(ensureGeminiStream(stream as AsyncIterable<unknown>), getIdManager());
        }
        const raw = await adapter.generate({
          model,
          input: body,
          signal: options?.signal,
        });
        if (!isGeminiResponse(raw))
          throw new Error("Unexpected Gemini response shape");
        return geminiToOpenAIResponse(raw, model, getIdManager());
      },
    },
    models: {
      async list() {
        const res = await adapter.listModels();
        return { data: res.data.map((m) => ({ id: m.id })) };
      },
    },
    setToolNameResolver(resolver: (callId: string) => string | undefined) {
      resolveToolName = resolver;
    },
    setConversationId(conversationId: string) {
      boundConversationId = conversationId;
    },
  };
}
