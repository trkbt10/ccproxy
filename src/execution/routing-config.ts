import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RoutingConfig } from "../config/types";
import { expandConfig } from "../config/expansion";
import { configureLogger } from "../utils/logging/enhanced-logger";
import { resolveConfigPath } from "../config/paths";
// Note: no need to import provider key selection here; config validation handles presence.

let cachedConfig: RoutingConfig | null = null;
let loadingPromise: Promise<RoutingConfig> | null = null;

export async function loadRoutingConfigOnce(): Promise<RoutingConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const ensured = await loadRoutingConfigFromFile();
      cachedConfig = ensured;
      return ensured;
    } catch {
      const fallback = synthesizeFallbackRoutingConfigFromEnv();
      if (fallback) {
        cachedConfig = fallback;
        return fallback;
      }
      const pathHint = resolveConfigPath();
      throw new Error(
        `No routing configuration found. Provide either: 1) environment variables (OPENAI_API_KEY or OPENAI_KEY), or 2) a config file at ${pathHint}.`
      );
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function getRoutingConfigCache(): RoutingConfig | null {
  return cachedConfig;
}

// Loads and validates the routing config from file (no fallbacks)
export async function loadRoutingConfigFromFile(): Promise<RoutingConfig> {
  const configPath = resolveConfigPath();
  const raw = await readFile(configPath, "utf8");
  const json = JSON.parse(raw) as RoutingConfig;
  const expanded = expandConfig(json);

  const ensured = expanded;

  // Validate API keys for configured providers: require keys from config.
  if (ensured.providers) {
    for (const [pid, p] of Object.entries(ensured.providers)) {
      const hasDirect = typeof p.apiKey === "string" && p.apiKey.length > 0;
      const hasPrefixMap =
        !!p.api &&
        p.api.keyByModelPrefix &&
        Object.keys(p.api.keyByModelPrefix).length > 0;
      if (!hasDirect && !hasPrefixMap) {
        throw new Error(
          `Provider '${pid}' (${p.type}) is missing API key configuration. ` +
            `Specify providers['${pid}'].apiKey or providers['${pid}'].api.keyByModelPrefix in the config.`
        );
      }
    }
  }

  // Apply logging configuration (dir/enabled) from config
  if (ensured.logging) {
    configureLogger({
      dir: ensured.logging.dir,
      enabled: ensured.logging.enabled,
      debugEnabled: ensured.logging.debugEnabled,
    });
  }

  return ensured;
}

// Synthesizes a minimal routing config from environment variables
export function synthesizeFallbackRoutingConfigFromEnv(): RoutingConfig | null {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;
  if (!key) return null;
  const cfg: RoutingConfig = {
    providers: {
      default: {
        type: "openai",
        apiKey: key,
        defaultHeaders: { "OpenAI-Beta": "responses-2025-06-21" },
      },
    },
    tools: [],
    defaults: {
      providerId: "default",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
  };
  return cfg;
}
