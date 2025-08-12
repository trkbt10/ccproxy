import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams as OpenAIResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";
import { selectApiKey } from "../shared/select-api-key";
import { isResponseEventStream } from "../openai-generic/guards";

// API key selection centralized in shared/select-api-key

export function buildOpenAIAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<OpenAIResponseCreateParams, unknown> {
  const resolvedKey = selectApiKey(provider, modelHint);
  if (!resolvedKey) throw new Error("Missing OpenAI API key");
  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL: provider.baseURL,
    defaultHeaders: provider.defaultHeaders,
  });
  return {
    name: "openai",
    async generate(params) {
      const body: OpenAIResponseCreateParams = { ...(params.input as OpenAIResponseCreateParams), model: params.model };
      return client.responses.create(body, params.signal ? { signal: params.signal } : undefined);
    },
    async *stream(params) {
      const body: OpenAIResponseCreateParams = {
        ...(params.input as OpenAIResponseCreateParams),
        model: params.model,
        stream: true,
      };
      const maybeStream = await client.responses.create(body, params.signal ? { signal: params.signal } : undefined);
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
