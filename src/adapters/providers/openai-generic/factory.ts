/**
 * @fileoverview Factory for creating OpenAI-compatible API clients
 *
 * Why: Provides a unified factory function that creates clients compatible with
 * both Chat Completions and Responses APIs, handling fallback logic and model-specific
 * parameter filtering.
 */

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
import { isResponseEventStream } from "./responses/guards";
import { convertChatParamsToResponseParams } from "./chat/params/chat-to-responses-converter";
import { isChatParamsStreaming, isChatParamsNonStreaming } from "./chat/guards/params";
import { isResponseParamsStreaming, isResponseParamsNonStreaming } from "./responses/guards/params";

/**
 * Check if a model is an O1-series model
 */
function isO1Model(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4");
}

/**
 * Filter chat parameters for model compatibility
 */
function filterChatParams(params: ChatCompletionCreateParams): ChatCompletionCreateParams {
  // Always remove temperature and top_p for all models
  const { temperature, top_p, ...filteredParams } = params;
  return filteredParams;
}

/**
 * Filter response parameters for model compatibility
 */
function filterResponseParams(params: ResponseCreateParams): ResponseCreateParams {
  // Always remove temperature and top_p for all models
  const { temperature, top_p, ...filteredParams } = params;
  return filteredParams;
}

/**
 * Build an OpenAI-compatible client with fallback logic between APIs
 */
export function buildOpenAIGenericAdapter(provider: Provider, modelHint?: string): OpenAICompatibleClient {
  const baseURL = provider.baseURL && provider.baseURL.trim().length > 0 ? provider.baseURL : undefined;

  if (!baseURL) {
    throw new Error(`Missing baseURL for provider '${provider.type}'. Set provider.baseURL in configuration.`);
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
        create: (async (params: ChatCompletionCreateParams, options?: { signal?: AbortSignal }) => {
          // Filter parameters for o1 models before calling native API
          const filteredParams = isO1Model(params.model) ? filterChatParams(params) : params;

          try {
            // Try native Chat Completions API first
            const result = await client.chat.completions.create(filteredParams, options);

            // Validate the response type matches what was requested
            if (params.stream && !isResponseEventStream(result)) {
              // Fallback if we got non-stream when stream was requested
              const responseParams = convertChatParamsToResponseParams(params);
              return shim.create(responseParams);
            }

            return result;
          } catch (error: unknown) {
            // Fallback to responses via shim (shim already handles filtering)
            if (isChatParamsStreaming(params)) {
              const responseParams = convertChatParamsToResponseParams(params);
              return shim.create(responseParams);
            } else if (isChatParamsNonStreaming(params)) {
              const responseParams = convertChatParamsToResponseParams(params);
              return shim.create(responseParams);
            }
            // This should never happen as params must be either streaming or non-streaming
            throw new Error("Invalid chat completion parameters");
          }
        }) as ChatCompletionsCreateFn,
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
            return shim.create(params);
          }

          return result;
        } catch (error: unknown) {
          // Fallback to chat completions via shim (shim already handles filtering)
          if (isResponseParamsStreaming(params)) {
            return shim.create(params);
          } else if (isResponseParamsNonStreaming(params)) {
            return shim.create(params);
          }
          // This should never happen as params must be either streaming or non-streaming
          throw new Error("Invalid response parameters");
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
            owned_by: m.owned_by,
          })),
        };
      },
    },
  };

  return openAIClient;
}
