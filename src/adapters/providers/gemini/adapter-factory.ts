import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { buildOpenAICompatibleClientForGemini } from "./openai-compatible";

// API key selection centralized in shared/select-api-key

export function buildGeminiAdapter(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  return buildOpenAICompatibleClientForGemini(provider, modelHint);
}
