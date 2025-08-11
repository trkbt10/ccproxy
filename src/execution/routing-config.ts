import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RoutingConfig } from "../config/types";
import { expandConfig } from "../config/expansion";
import { configureLogger } from "../utils/logging/enhanced-logger";
import { resolveConfigPath } from "../config/paths";
import { selectApiKey } from "../adapters/providers/shared/select-api-key";

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
      const configPath = resolveConfigPath();
      const raw = await readFile(configPath, "utf8");
      const json = JSON.parse(raw) as RoutingConfig;
      // Expand environment variables in the config
      const expanded = expandConfig(json);

      const ensured = expanded;

      // Validate API keys for configured providers: require keys from config.
      if (ensured.providers) {
        for (const [pid, p] of Object.entries(ensured.providers)) {
          // Keys must be provided in config (apiKey or keyByModelPrefix). No env fallback here.
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
      cachedConfig = ensured;
      return ensured;
    } catch (e) {
      // Config file not found or invalid: try dynamic synthesis from environment
      const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;
      if (key) {
        const synthesized: RoutingConfig = {
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
        cachedConfig = synthesized;
        return synthesized;
      }
      // Neither config nor environment is available: instruct user explicitly
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

// buildProviderClient moved to src/adapters/providers/build-provider-client.ts
