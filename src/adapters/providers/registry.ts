import type { Provider } from "../../config/types";
import type { ProviderAdapter, GenerateParams } from "./adapter";
import type { GenerateContentRequest, GenerateContentResponse } from "./gemini/fetch-client";
import { buildGeminiAdapter } from "./gemini/adapter-factory";
import { buildGrokAdapter } from "./grok/adapter-factory";
import { buildOpenAIAdapter } from "./openai/adapter-factory";
import { buildGroqAdapter } from "./groq/adapter-factory";

export function selectApiKey(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string,
  envFallbackName?: string | string[]
): string | null {
  const keyFromProvider = provider.apiKey;
  const keyHeader = provider.api?.keyHeader;
  const keyId = keyHeader ? getHeader(keyHeader) : null;
  const keyFromMap = keyId ? provider.api?.keys?.[keyId] : null;
  let keyFromModel: string | null = null;
  if (modelHint && provider.api?.keyByModelPrefix) {
    const entries = Object.entries(provider.api.keyByModelPrefix).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [prefix, apiKey] of entries) {
      if (modelHint.startsWith(prefix)) {
        keyFromModel = apiKey;
        break;
      }
    }
  }
  let envKey: string | null = null;
  if (envFallbackName) {
    if (Array.isArray(envFallbackName)) {
      for (const name of envFallbackName) {
        if (process.env[name]) {
          envKey = process.env[name]!;
          break;
        }
      }
    } else {
      envKey = process.env[envFallbackName] || null;
    }
  }
  return keyFromProvider || keyFromMap || keyFromModel || envKey || null;
}

export function getAdapterFor(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string
): ProviderAdapter {
  switch (provider.type) {
    case "openai": {
      return buildOpenAIAdapter(provider, getHeader, modelHint);
    }
    case "groq": {
      return buildGroqAdapter(provider, getHeader, modelHint);
    }
    case "gemini": {
      return buildGeminiAdapter(
        provider,
        getHeader,
        modelHint
      ) as ProviderAdapter<GenerateContentRequest, GenerateContentResponse>;
    }
    case "grok": {
      return buildGrokAdapter(provider, getHeader, modelHint) as ProviderAdapter;
    }
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}

// Grok SSE parser moved to grok/adapter-factory
