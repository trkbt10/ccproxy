import type { Provider } from "../../config/types";
import { buildOpenAICompatibleClientForClaude } from "./claude/openai-compatible";
import { buildOpenAICompatibleClientForGemini } from "./gemini/openai-compatible";
import { buildOpenAICompatibleClientForGrok } from "./grok/openai-compatible";
import { buildOpenAIAdapter } from "./openai/adapter-factory";
import { buildOpenAIGenericAdapter } from "./openai-generic/adapter-factory";
import type { OpenAICompatibleClient } from "./openai-client-types";

export function buildOpenAICompatibleClient(provider: Provider, modelHint?: string): OpenAICompatibleClient {
  if (provider.type === "gemini") {
    return buildOpenAICompatibleClientForGemini(provider, modelHint);
  }
  if (provider.type === "grok") {
    return buildOpenAICompatibleClientForGrok(provider, modelHint);
  }
  if (provider.type === "claude") {
    return buildOpenAICompatibleClientForClaude(provider, modelHint);
  }

  // Use specific adapter for OpenAI, generic adapter for others
  if (provider.type === "openai") {
    return buildOpenAIAdapter(provider, modelHint);
  }

  // Generic OpenAI-compatible providers
  return buildOpenAIGenericAdapter(provider, modelHint);
}
