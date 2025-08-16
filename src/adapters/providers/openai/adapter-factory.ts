import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient, ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import { selectApiKey } from "../shared/select-api-key";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { ResponseCreateParams } from "openai/resources/responses/responses";

function isO1Model(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4");
}

function filterChatParams(params: ChatCompletionCreateParams): ChatCompletionCreateParams {
  // Always remove temperature and top_p for all models
  const { temperature, top_p, ...filteredParams } = params;
  return filteredParams;
}

function filterResponseParams(params: ResponseCreateParams): ResponseCreateParams {
  // Always remove temperature and top_p for all models
  const { temperature, top_p, ...filteredParams } = params;
  return filteredParams;
}

export function buildOpenAIAdapter(provider: Provider, modelHint?: string): OpenAICompatibleClient {
  const resolvedKey = selectApiKey(provider, modelHint);
  if (!resolvedKey) throw new Error("Missing OpenAI API key");
  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL: provider.baseURL,
    defaultHeaders: { "OpenAI-Beta": "responses-2025-06-21", ...provider.defaultHeaders },
  });

  const openAIClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: (async (params: ChatCompletionCreateParams, options?: { signal?: AbortSignal }) => {
          // Filter parameters for o1 models before calling native API
          const filteredParams = isO1Model(params.model) ? filterChatParams(params) : params;

          // Try native Chat Completions API first
          return await client.chat.completions.create(filteredParams, options);
        }) as ChatCompletionsCreateFn,
      },
    },
    responses: {
      create: (async (params: ResponseCreateParams, options?: { signal?: AbortSignal }) => {
        // Filter parameters for o1 models before calling native API
        const filteredParams = filterResponseParams(params);

        return await client.responses.create(filteredParams, options);
      }) as ResponsesCreateFn,
    },
    models: {
      async list() {
        const res = await client.models.list();
        return {
          data: res.data.map((m) => ({
            id: m.id,
            object: m.object,
            created: m.created,
            owned_by: m.owned_by,
          })),
        };
      },
    },
  };

  return openAIClient;
}
