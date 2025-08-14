import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient, ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import type {
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import { selectApiKey } from "../shared/select-api-key";
import { ResponsesAPI } from "../../responses-adapter/responses-api";
import { isResponseEventStream } from "./guards";


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

  const openAIClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: client.chat.completions.create.bind(client.chat.completions) as ChatCompletionsCreateFn,
      },
    },
    responses: {
      create: (async (params: ResponseCreateParams, options?: { signal?: AbortSignal }) => {
        try {
          // Try native Responses API first
          const result = await client.responses.create(params, options);
          
          // Validate the response type matches what was requested
          if (params.stream && !isResponseEventStream(result)) {
            // Fallback if we got non-stream when stream was requested
            return shim.create(params as ResponseCreateParamsStreaming);
          }
          
          return result;
        } catch (error: unknown) {
          // Fallback to chat completions via shim
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
