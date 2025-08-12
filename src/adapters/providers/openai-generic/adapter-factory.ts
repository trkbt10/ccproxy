import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient, ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseCreateParamsNonStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { selectApiKey } from "../shared/select-api-key";
import { ResponsesAPI } from "../../responses-adapter/responses-api";
import { isResponseEventStream, isOpenAIResponse } from "./guards";

async function createViaResponsesAPI(
  client: OpenAI,
  body: ResponseCreateParams,
  signal?: AbortSignal
): Promise<OpenAIResponse> {
  const out = await client.responses.create(
    body,
    signal ? { signal } : undefined
  );
  if (isResponseEventStream(out)) {
    throw new Error("Expected non-stream response but got stream");
  }
  if (!isOpenAIResponse(out)) {
    throw new Error("Expected OpenAIResponse shape from Responses API");
  }
  return out;
}

async function* streamViaResponsesAPI(
  client: OpenAI,
  body: ResponseCreateParams,
  signal?: AbortSignal
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  const out = await client.responses.create(
    body,
    signal ? { signal } : undefined
  );
  if (!isResponseEventStream(out)) {
    throw new Error("Expected stream response when stream=true");
  }
  for await (const ev of out) yield ev;
}

async function createViaShim(
  shim: ResponsesAPI,
  body: ResponseCreateParams
): Promise<OpenAIResponse> {
  const nonStreamReq: ResponseCreateParamsNonStreaming = {
    ...body,
    stream: false,
  };
  return shim.create(nonStreamReq);
}

async function* streamViaShim(
  shim: ResponsesAPI,
  body: ResponseCreateParams
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  const streamReq: ResponseCreateParamsStreaming = { ...body, stream: true };
  const iterable = await shim.create(streamReq);
  for await (const ev of iterable) yield ev;
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
  const shim = new ResponsesAPI({ apiKey, baseURL });

  const openAIClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: client.chat.completions.create.bind(client.chat.completions) as ChatCompletionsCreateFn,
      },
    },
    responses: {
      create: (async (params: ResponseCreateParams, options?: { signal?: AbortSignal }) => {
        const wantsStream = Boolean(params.stream);
        
        if (wantsStream) {
          try {
            const out = await client.responses.create(
              params,
              options?.signal ? { signal: options.signal } : undefined
            );
            if (!isResponseEventStream(out)) {
              const streamReq: ResponseCreateParamsStreaming = {
                ...params,
                stream: true,
              };
              return shim.create(streamReq);
            }
            return out;
          } catch {
            const streamReq: ResponseCreateParamsStreaming = {
              ...params,
              stream: true,
            };
            return shim.create(streamReq);
          }
        }
        
        try {
          return await createViaResponsesAPI(client, params, options?.signal);
        } catch (e) {
          return await createViaShim(shim, params);
        }
      }) as ResponsesCreateFn,
    },
    models: {
      async list() {
        const res = await client.models.list();
        return { data: res.data.map((m) => ({ id: m.id })) };
      },
    },
  };
  
  return openAIClient;
}
