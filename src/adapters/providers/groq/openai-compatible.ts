import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient } from "../openai-compat/types";
import { buildOpenAICompatibleClientFromAdapter } from "../openai-compat/from-adapter";

// Groq is OpenAI Responses-compatible. We can reuse the generic
// adapter-based OpenAI-compatible client builder to provide
// a provider-scoped factory for consistency with other providers.
export function buildOpenAICompatibleClientForGroq(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  return buildOpenAICompatibleClientFromAdapter(provider, modelHint);
}

