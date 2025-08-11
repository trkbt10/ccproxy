import type { Provider } from "../../../config/types";

// API key selection (centralized):
// Priority:
// 1) provider.apiKey
// 2) provider.api.keyByModelPrefix (longest prefix match against modelHint)
// 3) well-known environment variable(s) for the provider type
// 4) null (not found)
export function selectApiKey(
  provider: Provider,
  modelHint?: string
): string | null {
  const direct = provider.apiKey || null;
  if (direct) return direct;

  if (modelHint && provider.api?.keyByModelPrefix) {
    const entries = Object.entries(provider.api.keyByModelPrefix).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [prefix, apiKey] of entries) {
      if (modelHint.startsWith(prefix)) {
        return apiKey;
      }
    }
  }

  // Fallback to common environment variables by provider type
  switch (provider.type) {
    case "openai": {
      return (
        process.env.OPENAI_API_KEY ||
        process.env.OPENAI_KEY ||
        null
      );
    }
    case "groq": {
      return process.env.GROQ_API_KEY || null;
    }
    case "claude": {
      return process.env.ANTHROPIC_API_KEY || null;
    }
    case "gemini": {
      return (
        process.env.GOOGLE_AI_STUDIO_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_AI_API_KEY ||
        null
      );
    }
    case "grok": {
      return process.env.GROK_API_KEY || process.env.XAI_API_KEY || null;
    }
    default:
      return null;
  }
}
