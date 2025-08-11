import type { Provider } from "../../config/types";
import type { ProviderAdapter, GenerateParams } from "./adapter";
import type { GenerateContentRequest, GenerateContentResponse } from "./gemini/fetch-client";
import { buildGeminiAdapter } from "./gemini/adapter-factory";
import { buildGrokAdapter } from "./grok/adapter-factory";
import { buildOpenAIAdapter } from "./openai/adapter-factory";
import { buildGroqAdapter } from "./groq/adapter-factory";

// API key selection and provider specifics are handled within each adapter factory.

export function getAdapterFor(
  provider: Provider,
  modelHint?: string
): ProviderAdapter {
  switch (provider.type) {
    case "openai": {
      return buildOpenAIAdapter(provider, modelHint);
    }
    case "groq": {
      return buildGroqAdapter(provider, modelHint);
    }
    case "gemini": {
      return buildGeminiAdapter(
        provider,
        modelHint
      ) as ProviderAdapter<GenerateContentRequest, GenerateContentResponse>;
    }
    case "grok": {
      return buildGrokAdapter(provider, modelHint) as ProviderAdapter;
    }
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}

// Grok SSE parser moved to grok/adapter-factory
