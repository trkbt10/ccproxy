import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { buildOpenAICompatibleClientForGrok } from "./openai-compatible";

// API key selection centralized in shared/select-api-key

// parseSSELine centralized in shared/sse

export function buildGrokAdapter(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  return buildOpenAICompatibleClientForGrok(provider, modelHint);
}
