import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { buildOpenAICompatibleClientForClaude } from "./openai-compatible";

export function buildClaudeAdapter(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  return buildOpenAICompatibleClientForClaude(provider, modelHint);
}
