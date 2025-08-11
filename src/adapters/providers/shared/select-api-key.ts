import type { Provider } from "../../../config/types";

// API key selection strictly from provider config only.
// Priority:
// 1) provider.apiKey
// 2) provider.api.keyByModelPrefix (longest prefix match against modelHint)
// No environment fallback here; config loader is responsible for ensuring keys.
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

  return null;
}
