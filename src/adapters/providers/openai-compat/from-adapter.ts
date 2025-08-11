import type { Provider } from "../../../config/types";
import { getAdapterFor } from "../registry";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "./types";

function isOpenAIResponse(v: unknown): v is OpenAIResponse {
  return typeof v === "object" && v !== null && (v as { object?: unknown }).object === "response";
}

function isResponseEventStream(v: unknown): v is AsyncIterable<ResponseStreamEvent> {
  return typeof v === "object" && v !== null && Symbol.asyncIterator in (v as Record<string, unknown>);
}

export function buildOpenAICompatibleClientFromAdapter(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const adapter = getAdapterFor(provider, modelHint);
  return {
    responses: {
      async create(
        params: ResponseCreateParams,
        options?: { signal?: AbortSignal }
      ): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>> {
        const model = params.model || (modelHint as string);
        const out = await adapter.generate({ model, input: params, signal: options?.signal });
        if (isOpenAIResponse(out) || isResponseEventStream(out)) return out;
        throw new Error("Adapter did not return OpenAI-compatible response or stream");
      },
    },
    models: {
      async list() {
        const res = await adapter.listModels();
        return { data: res.data.map((m) => ({ id: m.id })) };
      },
    },
  };
}

