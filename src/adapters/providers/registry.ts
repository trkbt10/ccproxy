import type { Provider } from "../../config/types";
import type { ProviderAdapter, GenerateParams } from "./adapter";
import type {
  GenerateContentRequest,
  GenerateContentResponse,
} from "./gemini/fetch-client";
import { buildGeminiAdapter } from "./gemini/adapter-factory";
import { buildOpenAIAdapter } from "./openai/adapter-factory";
import { buildGrokAdapter } from "./grok/adapter-factory";
import { buildClaudeAdapter } from "./claude/adapter-factory";
import { buildOpenAIGenericAdapter } from "./openai-generic/adapter-factory";

// API key selection and provider specifics are handled within each adapter factory.

export function getAdapterFor(
  provider: Provider,
  modelHint?: string
): ProviderAdapter {
  switch (provider.type) {
    case "openai": {
      return buildOpenAIAdapter(provider, modelHint);
    }
    case "claude": {
      return buildClaudeAdapter(provider, modelHint);
    }
    case "gemini": {
      return buildGeminiAdapter(provider, modelHint) as ProviderAdapter<
        GenerateContentRequest,
        GenerateContentResponse
      >;
    }
    case "grok": {
      return buildGrokAdapter(provider, modelHint) as ProviderAdapter;
    }
    default:
      return buildOpenAIGenericAdapter(provider, modelHint) as ProviderAdapter;
  }
}
