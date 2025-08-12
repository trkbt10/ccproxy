import type { Provider } from "../../config/types";
import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "./openai-client-types";
import { isResponseEventStream } from "./openai-generic/guards";
import { resolveModelForProvider } from "./shared/model-mapper";
import { selectApiKey } from "./shared/select-api-key";

export function buildOpenAICompatibleClient(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
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

  // Generic OpenAI-compatible path using OpenAI SDK
  const apiKey = selectApiKey(provider, modelHint) || "";
  const client = new OpenAI({ apiKey, baseURL: provider.baseURL, defaultHeaders: provider.defaultHeaders });
  return {
    responses: {
      async create(params: ResponseCreateParams, options?: { signal?: AbortSignal }) {
        return client.responses.create(params as any, options?.signal ? { signal: options.signal } : undefined);
      },
    },
    models: {
      async list() {
        const res = await client.models.list();
        return { data: res.data.map((m) => ({ id: m.id })) };
      },
    },
  };
}
