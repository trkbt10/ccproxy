import type { RoutingConfig, Provider } from "./types";
import type { ModelGrade } from "../tools/model/model-grade-detector";

export type ProviderModelMapping = {
  byGrade?: Partial<Record<ModelGrade, string>>;
  aliases?: Record<string, string>;
};

export type ModelMappingConfig = {
  byProviderType?: Record<Provider["type"] | string, ProviderModelMapping>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isObject(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (typeof k !== "string" || typeof val !== "string") return false;
  }
  return true;
}

function isByGrade(v: unknown): v is ProviderModelMapping["byGrade"] {
  if (!isObject(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (k !== "high" && k !== "mid" && k !== "low") return false;
    if (typeof val !== "string") return false;
  }
  return true;
}

export function isProviderModelMapping(v: unknown): v is ProviderModelMapping {
  if (!isObject(v)) return false;
  if ("byGrade" in v && v.byGrade != null && !isByGrade(v.byGrade)) return false;
  if ("aliases" in v && v.aliases != null && !isStringRecord(v.aliases)) return false;
  return true;
}

export function isModelMappingConfig(v: unknown): v is ModelMappingConfig {
  if (!isObject(v)) return false;
  if ("byProviderType" in v && v.byProviderType != null) {
    const bpt = (v as Record<string, unknown>)["byProviderType"];
    if (!isObject(bpt)) return false;
    for (const [k, val] of Object.entries(bpt)) {
      if (typeof k !== "string" || !isProviderModelMapping(val)) return false;
    }
  }
  return true;
}

export function getModelMapping(cfg: RoutingConfig | null | undefined): ModelMappingConfig | undefined {
  const mm = cfg && (cfg as Record<string, unknown>)["modelMapping"];
  if (isModelMappingConfig(mm)) return mm as ModelMappingConfig;
  return undefined;
}

export function getProviderModelMapping(
  cfg: RoutingConfig | null | undefined,
  providerType: Provider["type"] | string
): ProviderModelMapping | undefined {
  const mm = getModelMapping(cfg);
  const byProvider = mm?.byProviderType;
  if (byProvider && isObject(byProvider)) {
    const entry = (byProvider as Record<string, unknown>)[providerType as string];
    if (isProviderModelMapping(entry)) return entry;
  }
  return undefined;
}

export function getProviderAliases(
  cfg: RoutingConfig | null | undefined,
  providerType: Provider["type"] | string
): Record<string, string> | undefined {
  const pm = getProviderModelMapping(cfg, providerType);
  return pm?.aliases;
}

export function getProviderByGrade(
  cfg: RoutingConfig | null | undefined,
  providerType: Provider["type"] | string
): Partial<Record<ModelGrade, string>> | undefined {
  const pm = getProviderModelMapping(cfg, providerType);
  return pm?.byGrade;
}

