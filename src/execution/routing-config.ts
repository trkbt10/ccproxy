import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { RoutingConfig, Provider } from "../config/types";
import { expandConfig } from "../config/expansion";
import { configureLogger } from "../utils/logging/enhanced-logger";

let cachedConfig: RoutingConfig | null = null;
let loadingPromise: Promise<RoutingConfig> | null = null;

export async function loadRoutingConfigOnce(): Promise<RoutingConfig> {
  if (cachedConfig) return cachedConfig;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const configPath =
        process.env.ROUTING_CONFIG_PATH ||
        path.join(process.cwd(), "config", "routing.json");
      const raw = await readFile(configPath, "utf8");
      const json = JSON.parse(raw) as RoutingConfig;
      // Expand environment variables in the config
      const expanded = expandConfig(json);

      // Ensure a "default" provider exists by synthesizing from env when missing
      const ensured = ensureDefaultProvider(expanded);

      // Apply logging configuration (dir/enabled) from config
      if (ensured && (ensured as any).logging) {
        const logging = (ensured as any).logging as {
          dir?: string;
          enabled?: boolean;
          debugEnabled?: boolean;
          eventsEnabled?: boolean;
        };
        configureLogger({
          dir: logging.dir,
          enabled: logging.enabled,
          debugEnabled: logging.debugEnabled,
        });
      }
      cachedConfig = ensured;
      return ensured;
    } catch {
      // Fallback when no config file exists - empty providers
      const fallback: RoutingConfig = ensureDefaultProvider({ tools: [] });
      // No config: use defaults for logger
      cachedConfig = fallback;
      return fallback;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function getRoutingConfigCache(): RoutingConfig | null {
  return cachedConfig;
}

function synthesizeDefaultProviderFromEnv(): Provider {
  const apiKey = process.env.OPENAI_API_KEY;
  const provider: Provider = {
    type: "openai",
    // Include apiKey if available; buildProviderClient will also fallback to env
    ...(apiKey ? { apiKey } : {}),
    defaultHeaders: {
      "OpenAI-Beta": "responses-2025-06-21",
    },
  };
  return provider;
}

function ensureDefaultProvider(cfg: RoutingConfig): RoutingConfig {
  const result: RoutingConfig = { ...cfg };
  const providers = { ...(cfg.providers || {}) } as Record<string, Provider>;
  if (!providers["default"]) {
    providers["default"] = synthesizeDefaultProviderFromEnv();
  }
  result.providers = providers;
  return result;
}

function resolveApiKeyFromHeader(
  provider: Provider,
  getHeader: (name: string) => string | null
): string | null {
  const keyIdHeader = provider.api?.keyHeader;
  if (!keyIdHeader) return null;
  const id = getHeader(keyIdHeader);
  if (!id) return null;
  const apiKey = provider.api?.keys?.[id];
  return apiKey ?? null;
}

function resolveApiKeyByModelPrefix(
  provider: Provider,
  modelHint?: string
): string | null {
  if (!modelHint) return null;
  const mapping = provider.api?.keyByModelPrefix;
  if (!mapping) return null;
  // Check longest matching prefix first for determinism
  const entries = Object.entries(mapping).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, apiKey] of entries) {
    if (modelHint.startsWith(prefix)) {
      return apiKey;
    }
  }
  return null;
}

export function buildProviderClient(
  provider: Provider | undefined,
  getHeader: (name: string) => string | null,
  modelHint?: string
): OpenAI {
  // If no provider is defined, it means providers config doesn't exist
  // Fall back to environment variables
  if (!provider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "No OpenAI API key available. Provide OPENAI_API_KEY environment variable or configure providers."
      );
    }
    
    return new OpenAI({
      apiKey,
      defaultHeaders: {
        "OpenAI-Beta": "responses-2025-06-21",
      },
    });
  }

  if (provider.type !== "openai") {
    throw new Error(`Provider type '${provider.type}' is not supported yet`);
  }

  // Choose API key in the following order (all from configuration/ENV):
  // 1) provider.apiKey (direct from config)
  // 2) apiKeyHeader + id -> provider.api.keys[id]
  // 3) apiKeyByModelPrefix match
  // 4) process.env.OPENAI_API_KEY (as ultimate fallback)
  const keyFromProvider = provider.apiKey;
  const keyFromApiHeader = resolveApiKeyFromHeader(provider, getHeader);
  const keyFromModel = resolveApiKeyByModelPrefix(provider, modelHint);

  const apiKey = keyFromProvider || keyFromApiHeader || keyFromModel || process.env.OPENAI_API_KEY || null;
  if (!apiKey) {
    throw new Error(
      "No OpenAI API key available. Configure provider apiKey or provide OPENAI_API_KEY environment variable."
    );
  }

  const options: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey,
    defaultHeaders: provider.defaultHeaders,
  };

  if (provider.baseURL) {
    options.baseURL = provider.baseURL;
  }

  return new OpenAI(options);
}
