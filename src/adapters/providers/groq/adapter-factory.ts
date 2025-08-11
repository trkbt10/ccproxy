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

// API key selection centralized in shared/select-api-key

export function buildGroqAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<
  ResponseCreateParams,
  OpenAIResponse | ResponseStreamEvent
> {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Groq API key");
  const resolvedKey: string = apiKey;
  // Groq uses OpenAI-compatible endpoints under /openai/v1
  const baseURL = provider.baseURL || "https://api.groq.com/openai/v1";
  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL,
    defaultHeaders: provider.defaultHeaders,
  });
  type Req = ResponseCreateParams;
  function isResponseEventStream(v: unknown): v is AsyncIterable<ResponseStreamEvent> {
    return typeof v === "object" && v !== null && Symbol.asyncIterator in (v as Record<string, unknown>);
  }
  async function createViaResponsesAPI(
    body: Req,
    signal?: AbortSignal
  ): Promise<OpenAIResponse> {
    const out = await client.responses.create(body, signal ? { signal } : undefined);
    if (isResponseEventStream(out)) {
      throw new Error("Expected non-stream response but got stream");
    }
    return out as OpenAIResponse;
  }
  async function* streamViaResponsesAPI(
    body: Req,
    signal?: AbortSignal
  ): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    const out = await client.responses.create(body, signal ? { signal } : undefined);
    if (!isResponseEventStream(out)) {
      throw new Error("Expected stream response when stream=true");
    }
    for await (const ev of out) yield ev;
  }

  // Fallback: use our ResponsesAPI shim to emulate Responses API on top of Chat Completions
  async function createViaShim(
    body: Req,
    _signal?: AbortSignal
  ): Promise<OpenAIResponse> {
    const mod = await import("../../responses-adapter/responses-api");
    const Shim = mod.ResponsesAPI;
    const shim = new Shim({ apiKey: resolvedKey, baseURL });
    const nonStreamReq: ResponseCreateParamsNonStreaming = { ...(body as ResponseCreateParams), stream: false };
    const out = await shim.create(nonStreamReq);
    return out;
  }
  async function* streamViaShim(body: Req, _signal?: AbortSignal): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    const mod = await import("../../responses-adapter/responses-api");
    const Shim = mod.ResponsesAPI;
    const shim = new Shim({ apiKey: resolvedKey, baseURL });
    const streamReq: ResponseCreateParamsStreaming = { ...(body as ResponseCreateParams), stream: true };
    const iterable = (await shim.create(streamReq)) as AsyncIterable<ResponseStreamEvent>;
    for await (const ev of iterable) yield ev;
  }
  return {
    name: "groq",
    async generate(params) {
      const body: Req = { ...(params.input as ResponseCreateParams), model: params.model, stream: false };
      try {
        return await createViaResponsesAPI(body, params.signal);
      } catch (e) {
        // If Groq doesn't support Responses API yet, fallback to shim
        return await createViaShim(body, params.signal);
      }
    },
    async *stream(params) {
      const body: Req = { ...(params.input as ResponseCreateParams), model: params.model, stream: true };
      try {
        yield* streamViaResponsesAPI(body, params.signal);
      } catch (e) {
        yield* streamViaShim(body, params.signal);
      }
    },
    async listModels() {
      const res = await client.models.list();
      const data = res.data.map((m) => ({ id: m.id, object: "model" as const }));
      return { object: "list" as const, data };
    },
  };
}
