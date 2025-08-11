import OpenAI from "openai";
import type {
  ResponseCreateParams as OpenAIResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";
import { selectApiKey } from "../shared/select-api-key";

// API key selection centralized in shared/select-api-key

export function buildOpenAIAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<OpenAIResponseCreateParams, unknown> {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing OpenAI API key");
  const resolvedKey: string = apiKey;
  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL: provider.baseURL,
    defaultHeaders: provider.defaultHeaders,
  });
  type Req = Parameters<OpenAI["responses"]["create"]>[0];
  function isResponseEventStream(v: unknown): v is AsyncIterable<ResponseStreamEvent> {
    return typeof v === "object" && v !== null && Symbol.asyncIterator in (v as Record<string, unknown>);
  }
  return {
    name: "openai",
    async generate(params) {
      const body: OpenAIResponseCreateParams = { ...(params.input as OpenAIResponseCreateParams), model: params.model, stream: false };
      return client.responses.create(
        body,
        params.signal ? { signal: params.signal } : undefined
      );
    },
    async *stream(params) {
      const body: OpenAIResponseCreateParams = { ...(params.input as OpenAIResponseCreateParams), model: params.model, stream: true };
      const maybeStream = await client.responses.create(
        body,
        params.signal ? { signal: params.signal } : undefined
      );
      if (!isResponseEventStream(maybeStream)) {
        throw new Error("Expected OpenAI responses.create to return a stream when stream=true");
      }
      for await (const ev of maybeStream) {
        yield ev;
      }
    },
    async listModels() {
      const res = await client.models.list();
      const data = res.data.map((m) => ({ id: m.id, object: "model" as const }));
      return { object: "list" as const, data };
    },
  };
}
