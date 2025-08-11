import { readFile } from "node:fs/promises";
import { resolveConfigPath } from "./paths";
import { expandConfig } from "./expansion";
import type { RoutingConfig } from "./types";
import { configureLogger } from "../utils/logging/enhanced-logger";

let cachedConfig: RoutingConfig | null = null;
let loadingPromise: Promise<RoutingConfig> | null = null;

export async function loadRoutingConfigOnce(): Promise<RoutingConfig> {
  if (cachedConfig) return cachedConfig;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const configPath = resolveConfigPath();
      const raw = await readFile(configPath, "utf8");
      const json = JSON.parse(raw) as RoutingConfig;
      const expanded = expandConfig(json);

      if (expanded.logging) {
        configureLogger({
          dir: expanded.logging.dir,
          enabled: expanded.logging.enabled,
          debugEnabled: expanded.logging.debugEnabled,
        });
      }
      cachedConfig = expanded;
      return expanded;
    } catch {
      // Dynamic synthesis from environment as a fallback
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
          defaults: { providerId: "default", model: process.env.OPENAI_MODEL || "gpt-4o-mini" },
        };
        cachedConfig = synthesized;
        return synthesized;
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

