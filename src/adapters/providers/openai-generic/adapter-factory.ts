import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";
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
): ProviderAdapter<ResponseCreateParams, unknown> {
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

  return {
    name: `${provider.type}`,
    async generate(params) {
      const wantsStream = Boolean(
        (params.input as { stream?: boolean }).stream
      );
      const body: ResponseCreateParams = {
        ...params.input,
        model: params.model,
        stream: wantsStream,
      };
      if (wantsStream) {
        try {
          const out = await client.responses.create(
            body,
            params.signal ? { signal: params.signal } : undefined
          );
          if (!isResponseEventStream(out)) {
            const streamReq: ResponseCreateParamsStreaming = {
              ...body,
              stream: true,
            };
            return shim.create(streamReq);
          }
          return out;
        } catch {
          const streamReq: ResponseCreateParamsStreaming = {
            ...body,
            stream: true,
          };
          return shim.create(streamReq);
        }
      }
      try {
        return await createViaResponsesAPI(client, body, params.signal);
      } catch (e) {
        return await createViaShim(shim, body);
      }
    },
    async *stream(params) {
      const body: ResponseCreateParams = {
        ...params.input,
        model: params.model,
        stream: true,
      };
      try {
        yield* streamViaResponsesAPI(client, body, params.signal);
      } catch (e) {
        yield* streamViaShim(shim, body);
      }
    },
    async listModels() {
      const res = await client.models.list();
      const data = res.data.map((m) => ({
        id: m.id,
        object: "model" as const,
      }));
      return { object: "list" as const, data };
    },
  };
}
