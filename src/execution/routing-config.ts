import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { RoutingConfig } from "./tool-model-planner";

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
      cachedConfig = json;
      return json;
    } catch {
      const fallback: RoutingConfig = {
        defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        overrideHeader: "x-openai-model",
        tools: [],
      };
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

function resolveApiKeyFromHeader(
  cfg: RoutingConfig,
  getHeader: (name: string) => string | null
): string | null {
  const apiKeyDirect = getHeader("x-openai-api-key");
  if (apiKeyDirect) return apiKeyDirect;

  const keyIdHeader = cfg.openai?.apiKeyHeader;
  if (!keyIdHeader) return null;
  const id = getHeader(keyIdHeader);
  if (!id) return null;
  const envName = cfg.openai?.apiKeys?.[id];
  if (!envName) return null;
  return process.env[envName] ?? null;
}

function resolveApiKeyByModelPrefix(
  cfg: RoutingConfig,
  modelHint?: string
): string | null {
  if (!modelHint) return null;
  const mapping = cfg.openai?.apiKeyByModelPrefix;
  if (!mapping) return null;
  // Check longest matching prefix first for determinism
  const entries = Object.entries(mapping).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, envName] of entries) {
    if (modelHint.startsWith(prefix)) {
      const key = process.env[envName];
      if (key) return key;
    }
  }
  return null;
}

export function buildOpenAIClientForRequest(
  cfg: RoutingConfig,
  getHeader: (name: string) => string | null,
  modelHint?: string
): OpenAI {
  // Choose API key in the following order:
  // 1) x-openai-api-key header (direct)
  // 2) apiKeyHeader + id -> cfg.openai.apiKeys[id] -> env var
  // 3) apiKeyByModelPrefix match -> env var
  // 4) process.env.OPENAI_API_KEY
  const keyFromHeader = resolveApiKeyFromHeader(cfg, getHeader);
  const keyFromModel = resolveApiKeyByModelPrefix(cfg, modelHint);

  const apiKey = keyFromHeader || keyFromModel || process.env.OPENAI_API_KEY || null;
  if (!apiKey) {
    throw new Error(
      "No OpenAI API key available. Provide OPENAI_API_KEY or configure routingConfig.openai."
    );
  }

  // Merge headers: ensure Responses API beta header is present by default
  const defaultHeaders: Record<string, string> = {
    "OpenAI-Beta": "responses-2025-06-21",
    ...(cfg.openai?.defaultHeaders || {}),
  };

  return new OpenAI({
    apiKey,
    defaultHeaders,
  });
}
