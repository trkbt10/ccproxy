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

  // Wrapper for chat completions that filters o1 model parameters
  const chatCompletionsCreate: ChatCompletionsCreateFn = async (params: any, options?: any) => {
    const filteredParams = filterChatParams(params);
    return client.chat.completions.create(filteredParams, options);
  };

  // Wrapper for responses that filters o1 model parameters
  const responsesCreate: ResponsesCreateFn = async (params: any, options?: any) => {
    const filteredParams = filterResponseParams(params);
    return client.responses.create(filteredParams, options);
  };

  const openAIClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: chatCompletionsCreate,
      },
    },
    responses: {
      create: responsesCreate,
    },
    models: {
      async list() {
        const res = await client.models.list();
        return { 
          data: res.data.map((m) => ({ 
            id: m.id,
            object: m.object,
            created: m.created,
            owned_by: m.owned_by
          })) 
        };
      },
    },
  };

  return openAIClient;
}
