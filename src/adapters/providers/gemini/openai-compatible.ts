import type { Provider } from "../../../config/types";
import { GeminiFetchClient } from "./fetch-client";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { defineChatCompletionsCreate, defineResponsesCreate } from "../openai-client-types";
import type { GenerateContentRequest } from "./fetch-client";
import { ensureGeminiStream, isGeminiResponse } from "../gemini/guards";
import { responsesToGeminiRequest } from "./request";
import { geminiToOpenAIStream } from "./openai-stream-adapter";
import { geminiToOpenAIResponse } from "./openai-response-adapter";
import { resolveModelForProvider } from "../shared/model-mapper";
import { geminiToChatCompletion, geminiToChatCompletionStream } from "./openai-chat-adapter";
import type {
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

// Narrowing helpers
function isChatStreaming(p: ChatCompletionCreateParams): boolean {
  return !!(p as { stream?: boolean }).stream;
}
function isResponseStreaming(p: ResponseCreateParams): boolean {
  return "stream" in p && (p as { stream?: boolean }).stream === true;
}

export function buildOpenAICompatibleClientForGemini(provider: Provider, modelHint?: string): OpenAICompatibleClient {
  const apiKey =
    provider.apiKey ||
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    "";
  const client = new GeminiFetchClient({ apiKey, baseURL: provider.baseURL });
  let resolveToolName: ((callId: string) => string | undefined) | undefined;
  let boundConversationId: string | undefined;

  const chatCompletionsCreate = defineChatCompletionsCreate(
    async (params: ChatCompletionCreateParams): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> => {
      const model = await resolveModelForProvider({
        provider,
        sourceModel: params.model || modelHint,
        modelHint,
      });
      if (isChatStreaming(params)) return geminiToChatCompletionStream({ ...params, model });
      return geminiToChatCompletion({ ...params, model });
    }
  );

  const responsesCreate = defineResponsesCreate(
    async (
      params: ResponseCreateParams,
      options?: { signal?: AbortSignal }
    ): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>> => {
      const model = await resolveModelForProvider({
        provider,
        sourceModel: (params as { model?: string }).model || modelHint,
        modelHint,
      });
      const body = responsesToGeminiRequest(params, resolveToolName);
      if (isResponseStreaming(params)) {
        const stream = client.streamGenerateContent(model, body as GenerateContentRequest, options?.signal);
        return geminiToOpenAIStream(
          ensureGeminiStream(stream as AsyncIterable<unknown>)
        ) as AsyncIterable<ResponseStreamEvent>;
      }
      const raw = await client.generateContent(model, body as GenerateContentRequest, options?.signal);
      if (!isGeminiResponse(raw)) throw new Error("Unexpected Gemini response shape");
      return geminiToOpenAIResponse(raw, model) as OpenAIResponse;
    }
  );

  return {
    chat: { completions: { create: chatCompletionsCreate } },
    responses: { create: responsesCreate },
    models: {
      async list() {
        const res = await client.listModels();
        return { data: res.models.map((m) => ({ id: m.name })) };
      },
    },
    setToolNameResolver(resolver: (callId: string) => string | undefined) {
      resolveToolName = resolver;
    },
    setConversationId(conversationId: string) {
      boundConversationId = conversationId; // placeholder
    },
  };
}
