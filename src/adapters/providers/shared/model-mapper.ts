import type { Provider, RoutingConfig } from "../../../config/types";
import { getRoutingConfigCache } from "../../../execution/routing-config";
import { detectModelGrade } from "../../../tools/model/model-grade-detector";
import {
  getProviderAliases,
  getProviderByGrade,
} from "../../../config/model-mapping";
import { getCachedModelIds } from "./model-list-cache";
// API key resolution happens inside adapters; no env fallback here

type ProviderType = Provider["type"];

function normalizeModelName(name?: string): string | undefined {
  if (!name) return undefined;
  let s = String(name).trim();
  if (s.startsWith("models/")) s = s.slice("models/".length);
  return s;
}

function pickByGrade(
  grade: "high" | "mid" | "low",
  providerType: ProviderType,
  cfg: RoutingConfig | null
): string | undefined {
  const byGrade = getProviderByGrade(cfg, providerType);
  return byGrade?.[grade];
}

function tryMapByGrade(
  modelName: string | undefined,
  providerType: ProviderType,
  cfg: RoutingConfig | null
): string | undefined {
  if (!modelName) return undefined;
  const grade = detectModelGrade(modelName);
  return pickByGrade(grade, providerType, cfg);
}

function resolveWithDefaults(
  sourceModel: string | undefined,
  defaultModel: string | undefined,
  providerType: ProviderType,
  cfg: RoutingConfig | null
): string {
  // Try grade mapping for provided source model
  {
    const mapped = tryMapByGrade(sourceModel, providerType, cfg);
    if (mapped) return mapped;
  }
  // If no source provided, try mapping the configured default model
  if (!sourceModel && defaultModel) {
    const mapped = tryMapByGrade(defaultModel, providerType, cfg);
    if (mapped) return mapped;
  }
  // Fallback to original or default
  return sourceModel || defaultModel || "";
}

/**
 * Maps a source model name to a target provider's roughly equivalent model.
 * If a lister is provided, prefers picking from actual provider `listModels()` results
 * by matching grade, avoiding hardcoded defaults.
 */
export function mapModelToProvider(params: {
  targetProviderType: ProviderType;
  sourceModel?: string;
  routingConfig?: RoutingConfig | null;
}): string {
  const providerType = params.targetProviderType;
  const cfg = params.routingConfig ?? getRoutingConfigCache();
  const sourceModel = normalizeModelName(params.sourceModel);
  const defaultModel = cfg?.defaults?.model;

  // 1) Provider-specific alias mapping
  const aliases = getProviderAliases(cfg, providerType);
  if (aliases && sourceModel && aliases[sourceModel]) {
    return aliases[sourceModel];
  }

  // 2) Grade-based mapping and fallbacks consolidated
  return resolveWithDefaults(sourceModel, defaultModel, providerType, cfg);
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
  const defaultModel = cfg?.defaults?.model;

  // Aliases first
  const aliases = getProviderAliases(cfg, providerType);
  if (aliases && sourceModel && aliases[sourceModel]) {
    return aliases[sourceModel];
  }

  // Load provider models and pick by grade
  try {
    const lister =
      params.listAvailableModels ||
      (async () =>
        await listModelsForProvider(params.provider, params.modelHint));
    const ids = (await lister())
      .map(normalizeModelName)
      .filter(Boolean) as string[];
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

  // Fallbacks consolidated
  return resolveWithDefaults(sourceModel, defaultModel, providerType, cfg);
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
    const max = numbers.reduce(
      (acc, n) => Math.max(acc, parseInt(n, 10) || 0),
      0
    );
    // Small bonus for contains 'pro' or 'sonnet' vs 'mini'/'lite'
    const bonus = /pro|opus|sonnet|ultra/i.test(id) ? 100 : 0;
    const malus = /mini|lite|nano|tiny|fast/i.test(id) ? -50 : 0;
    return max + bonus + malus;
  };
  return [...ids].sort((a, b) => score(b) - score(a));
}

// No provider-prefix hardcoding; mapping always flows through grade/aliases and live list.

async function listModelsForProvider(
  provider: Provider,
  modelHint?: string
): Promise<string[]> {
  return await getCachedModelIds(provider, modelHint);
}
