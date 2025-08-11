import type { Provider } from "../../config/types";
import type { OpenAICompatibleClient } from "./openai-compat/types";
import { buildOpenAICompatibleClientForGemini } from "./gemini/openai-compatible";
import { buildOpenAICompatibleClientForGrok } from "./grok/openai-compatible";
import { buildOpenAICompatibleClientForClaude } from "./claude/openai-compatible";
import { buildOpenAICompatibleClientFromAdapter } from "./openai-compat/from-adapter";

export function buildProviderClient(
  provider: Provider | undefined,
  modelHint?: string
): OpenAICompatibleClient {
  if (!provider) {
    throw new Error("No provider configured. Define providers in RoutingConfig.");
  }

  if (provider.type === "gemini") {
    return buildOpenAICompatibleClientForGemini(provider, modelHint);
  }
  if (provider.type === "grok") {
    return buildOpenAICompatibleClientForGrok(provider, modelHint);
  }
  if (provider.type === "claude") {
    return buildOpenAICompatibleClientForClaude(provider, modelHint);
  }

  // For other providers (e.g. openai, groq), use adapter-based OpenAI-compatible client
  return buildOpenAICompatibleClientFromAdapter(provider, modelHint);
}

