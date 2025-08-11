import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../adapters/providers/openai-compat/types";
import { buildOpenAICompatibleClientForGemini } from "../adapters/providers/gemini/openai-compatible";
import { buildOpenAICompatibleClientForGrok } from "../adapters/providers/grok/openai-compatible";
import { buildOpenAICompatibleClientForClaude } from "../adapters/providers/claude/openai-compatible";
import type { RoutingConfig, Provider } from "../config/types";
import { expandConfig } from "../config/expansion";
import { configureLogger } from "../utils/logging/enhanced-logger";
import { resolveConfigPath } from "../config/paths";
import { selectApiKey } from "../adapters/providers/shared/select-api-key";
import { buildOpenAICompatibleClientFromAdapter } from "../adapters/providers/openai-compat/from-adapter";

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
          defaults: { providerId: "default", model: process.env.OPENAI_MODEL || "gpt-4o-mini" },
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

// No implicit default provider synthesis. Providers must be specified in config.

// resolveConfigPath now provided from src/config/paths

// Header-based API key resolution removed; providers must specify keys directly.

// API key resolution centralized in shared/select-api-key

export function buildProviderClient(
  provider: Provider | undefined,
  modelHint?: string
): OpenAICompatibleClient {
  if (!provider) {
    throw new Error("No provider configured. Define providers in RoutingConfig.");
  }

  if (provider.type === "gemini") {
    return buildOpenAICompatibleClientForGemini(provider, modelHint);
  }
  if (provider.type === "grok") {
    return buildOpenAICompatibleClientForGrok(provider, modelHint);
  }
  if (provider.type === "claude") {
    return buildOpenAICompatibleClientForClaude(provider, modelHint);
  }

  // For other providers (e.g. openai, groq), use adapter-based OpenAI-compatible client
  return buildOpenAICompatibleClientFromAdapter(provider, modelHint);
}
