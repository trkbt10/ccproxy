import type { Provider } from "../../config/types";
import { getAdapterFor } from "./registry";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "./openai-client-types";
import { isResponseEventStream } from "./openai-generic/guards";
import { resolveModelForProvider } from "./shared/model-mapper";

export function buildOpenAIClient(
  provider: Provider | undefined,
  modelHint?: string
): OpenAICompatibleClient {
  if (!provider) {
    throw new Error("No provider configured. Define providers in RoutingConfig.");
  }
  // Delegate to specialized clients where needed
  if (provider.type === "gemini") {
    const { buildOpenAICompatibleClientForGemini } = require("./gemini/openai-compatible");
    return buildOpenAICompatibleClientForGemini(provider, modelHint);
  }
  if (provider.type === "grok") {
    const { buildOpenAICompatibleClientForGrok } = require("./grok/openai-compatible");
    return buildOpenAICompatibleClientForGrok(provider, modelHint);
  }
  if (provider.type === "claude") {
    const { buildOpenAICompatibleClientForClaude } = require("./claude/openai-compatible");
    return buildOpenAICompatibleClientForClaude(provider, modelHint);
  }

  // Generic path for OpenAI-compatible adapters
  const adapter = getAdapterFor(provider, modelHint);
  return {
    responses: {
      async create(
        params: ResponseCreateParams,
        options?: { signal?: AbortSignal }
      ): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>> {
        const model = await resolveModelForProvider({
          provider,
          sourceModel:
            (params.model as string | undefined) ||
            (modelHint as string | undefined),
          modelHint,
        });
        const out = await adapter.generate({
          model,
          input: params,
          signal: options?.signal,
        });
        if (
          (typeof out === "object" && out !== null && (out as { object?: unknown }).object === "response") ||
          isResponseEventStream(out)
        ) {
          return out as OpenAIResponse | AsyncIterable<ResponseStreamEvent>;
        }
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

