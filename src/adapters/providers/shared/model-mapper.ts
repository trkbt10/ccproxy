import type { Provider, RoutingConfig } from "../../../config/types";
import { getRoutingConfigCache } from "../../../execution/routing-config";
import { detectModelGrade } from "../../../tools/model/model-grade-detector";
import { getProviderAliases, getProviderByGrade } from "../../../config/model-mapping";
import { getAdapterFor } from "../registry";
import { selectApiKey } from "./select-api-key";
import Anthropic from "@anthropic-ai/sdk";

type ProviderType = Provider["type"];

function normalizeModelName(name?: string): string | undefined {
  if (!name) return undefined;
  let s = String(name).trim();
  if (s.startsWith("models/")) s = s.slice("models/".length);
  return s;
}

function pickByGrade(grade: "high" | "mid" | "low", providerType: ProviderType, cfg: RoutingConfig | null): string | undefined {
  const byGrade = getProviderByGrade(cfg, providerType);
  return byGrade?.[grade];
}

/**
 * Maps a source model name to a target provider's roughly equivalent model.
 * If a lister is provided, prefers picking from actual provider `listModels()` results
 * by matching grade, avoiding hardcoded defaults.
 */
export function mapModelToProvider(
  params: {
    targetProviderType: ProviderType;
    sourceModel?: string;
    routingConfig?: RoutingConfig | null;
  }
): string {
  const providerType = params.targetProviderType;
  const cfg = params.routingConfig ?? getRoutingConfigCache();
  const sourceModel = normalizeModelName(params.sourceModel);

  // 1) Provider-specific alias mapping
  const aliases = getProviderAliases(cfg, providerType);
  if (aliases && sourceModel && aliases[sourceModel]) {
    return aliases[sourceModel];
  }

  // 2) Grade-based mapping
  if (sourceModel) {
    const grade = detectModelGrade(sourceModel);
    const mapped = pickByGrade(grade, providerType, cfg);
    if (mapped) return mapped;
  }

  // 3) Fallbacks
  const defaultModel = cfg?.defaults?.model;
  if (!sourceModel && defaultModel) {
    const grade = detectModelGrade(defaultModel);
    const mapped = pickByGrade(grade, providerType, cfg);
    if (mapped) return mapped;
  }

  // Keep source model or config default as last resort, no hardcoded fallbacks
  return sourceModel || defaultModel || "";
}

/**
 * Async model resolution that uses provider.listModels() to select by grade.
 * Falls back to config and minimal defaults if the list is unavailable.
 */
export async function resolveModelForProvider(params: {
  provider: Provider;
  sourceModel?: string;
  modelHint?: string;
  routingConfig?: RoutingConfig | null;
  listAvailableModels?: () => Promise<string[]>; // optional override for tests
}): Promise<string> {
  const providerType = params.provider.type as ProviderType;
  const cfg = params.routingConfig ?? getRoutingConfigCache();
  const sourceModel = normalizeModelName(params.sourceModel);

  // Aliases first
  const aliases = getProviderAliases(cfg, providerType);
  if (aliases && sourceModel && aliases[sourceModel]) {
    return aliases[sourceModel];
  }

  // Load provider models and pick by grade
  try {
    const lister = params.listAvailableModels || (async () => await listModelsForProvider(params.provider, params.modelHint));
    const ids = (await lister()).map(normalizeModelName).filter(Boolean) as string[];
    if (ids.length > 0) {
      const grade = detectModelGrade(sourceModel || cfg?.defaults?.model || "");
      const graded = ids.filter((id) => detectModelGrade(id) === grade);
      const pool = graded.length ? graded : ids;
      const picked = pickBestModelId(pool);
      if (picked) return picked;
    }
  } catch {
    // ignore list errors and fall back
  }

  // Fallbacks similar to sync version (no hardcoded tables)
  if (sourceModel) {
    const grade = detectModelGrade(sourceModel);
    const mapped = pickByGrade(grade, providerType, cfg);
    if (mapped) return mapped;
  }
  const defaultModel = cfg?.defaults?.model;
  if (!sourceModel && defaultModel) {
    const grade = detectModelGrade(defaultModel);
    const mapped = pickByGrade(grade, providerType, cfg);
    if (mapped) return mapped;
  }
  return sourceModel || defaultModel || "";
}

function pickBestModelId(ids: string[]): string | undefined {
  // Prefer ids containing 'latest'
  const latest = ids.filter((id) => /latest/i.test(id));
  if (latest.length) return sortByRecency(latest)[0];
  // Otherwise sort by recency heuristics
  const sorted = sortByRecency(ids);
  return sorted[0];
}

function sortByRecency(ids: string[]): string[] {
  // Heuristic: extract largest numeric token (e.g., dates like 20241022 or version numbers), desc
  const score = (id: string): number => {
    const numbers = id.match(/\d{6,}|\d+/g) || [];
    const max = numbers.reduce((acc, n) => Math.max(acc, parseInt(n, 10) || 0), 0);
    // Small bonus for contains 'pro' or 'sonnet' vs 'mini'/'lite'
    const bonus = /pro|opus|sonnet|ultra/i.test(id) ? 100 : 0;
    const malus = /mini|lite|nano|tiny|fast/i.test(id) ? -50 : 0;
    return max + bonus + malus;
  };
  return [...ids].sort((a, b) => score(b) - score(a));
}

function fallbackProviderDefault(providerType: ProviderType): string {
  // Give a stable safe default per provider when everything else fails
  switch (providerType) {
    case "gemini":
      return "gemini-1.5-flash";
    case "claude":
      return "claude-3-5-sonnet-20241022";
    case "grok":
      return "grok-3-mini";
    case "openai":
      return "gpt-4o-mini";
    default:
      // Unknown providers: try to stay generic
      return "gpt-4o-mini";
  }
}

// No provider-prefix hardcoding; mapping always flows through grade/aliases and live list.

async function listModelsForProvider(provider: Provider, modelHint?: string): Promise<string[]> {
  switch (provider.type) {
    case "gemini":
    case "grok":
    case "openai":
    case "groq": {
      const adapter = getAdapterFor(provider, modelHint);
      const res = await adapter.listModels();
      return res.data.map((m) => m.id);
    }
    case "claude": {
      const key = selectApiKey(provider, modelHint) || process.env.ANTHROPIC_API_KEY;
      if (!key) return [];
      const anthropic = new Anthropic({ apiKey: key, baseURL: provider.baseURL });
      const models = await anthropic.models.list();
      return models.data.map((m) => m.id);
    }
    default:
      return [];
  }
}
