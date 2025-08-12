import type { Provider } from "../../../config/types";
import { GeminiFetchClient } from "./fetch-client";
import type {
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-client-types";
import type { GenerateContentRequest } from "./fetch-client";
import { ensureGeminiStream, isGeminiResponse } from "../gemini/guards";
import { responsesToGeminiRequest } from "./request";
import { geminiToOpenAIStream } from "./openai-stream-adapter";
import { geminiToOpenAIResponse } from "./openai-response-adapter";
import { resolveModelForProvider } from "../shared/model-mapper";

// conversion logic moved to converters/providers/gemini/request

export function buildOpenAICompatibleClientForGemini(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const apiKey = provider.apiKey || process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
  const client = new GeminiFetchClient({ apiKey, baseURL: provider.baseURL });
  let resolveToolName: ((callId: string) => string | undefined) | undefined;
  let boundConversationId: string | undefined;
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
          const stream = client.streamGenerateContent(model, body as GenerateContentRequest, options?.signal);
          return geminiToOpenAIStream(ensureGeminiStream(stream as AsyncIterable<unknown>));
        }
        const raw = await client.generateContent(model, body as GenerateContentRequest, options?.signal);
        if (!isGeminiResponse(raw))
          throw new Error("Unexpected Gemini response shape");
        return geminiToOpenAIResponse(raw, model);
      },
    },
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
      boundConversationId = conversationId;
    },
  };
}
