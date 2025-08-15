import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient, ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import type {
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { selectApiKey } from "../shared/select-api-key";
import { ResponsesAPI } from "./responses-adapter/responses-api";
import { isResponseEventStream } from "./guards";

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


export function buildOpenAIGenericAdapter(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const baseURL =
    provider.baseURL && provider.baseURL.trim().length > 0
      ? provider.baseURL
      : undefined;

  if (!baseURL) {
    throw new Error(
      `Missing baseURL for provider '${provider.type}'. Set provider.baseURL in configuration.`
    );
  }

  // Keys: prefer configured; if missing and local base, use a dummy key
  const apiKey = selectApiKey(provider, modelHint) || ""; // allow 401 from upstream if required

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: provider.defaultHeaders,
  });
  const shim = new ResponsesAPI(client);

  // Wrapper for chat completions that filters o1 model parameters
  const chatCompletionsCreate: ChatCompletionsCreateFn = async (params: any, options?: any) => {
    const filteredParams = filterChatParams(params);
    return client.chat.completions.create(filteredParams, options);
  };

  const openAIClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: chatCompletionsCreate,
      },
    },
    responses: {
      create: (async (params: ResponseCreateParams, options?: { signal?: AbortSignal }) => {
        try {
          // Filter parameters for o1 models before calling native API
          const filteredParams = filterResponseParams(params);
          
          // Try native Responses API first
          const result = await client.responses.create(filteredParams, options);
          
          // Validate the response type matches what was requested
          if (params.stream && !isResponseEventStream(result)) {
            // Fallback if we got non-stream when stream was requested
            return shim.create(params as ResponseCreateParamsStreaming);
          }
          
          return result;
        } catch (error: unknown) {
          // Fallback to chat completions via shim (shim already handles filtering)
          if (params.stream) {
            return shim.create(params as ResponseCreateParamsStreaming);
          } else {
            return shim.create(params as ResponseCreateParamsNonStreaming);
          }
        }
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
            owned_by: m.owned_by
          })) 
        };
      },
    },
  };
  
  return openAIClient;
}
