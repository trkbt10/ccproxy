import type { RoutingConfig } from "../config/types";
import { planToolExecution } from "./tool-model-planner";

export type ProviderSelectionOptions = {
  explicitModel?: string | null | undefined;
  toolNames?: string[];
  defaultModel?: string; // fallback if nothing specified
};

export function selectProvider(
  cfg: RoutingConfig,
  opts: ProviderSelectionOptions = {}
): { providerId: string; model: string } {
  const explicitModel = typeof opts.explicitModel === "string" ? opts.explicitModel : undefined;
  const toolNames = Array.isArray(opts.toolNames) ? opts.toolNames : [];

  // Prefer tool-defined responses_model steps
  for (const name of toolNames) {
    const steps = planToolExecution(cfg, name, undefined);
    for (const s of steps) {
      if (s.kind === "responses_model") {
        const providerId = s.providerId || cfg.defaults?.providerId || "default";
        const model = explicitModel || s.model || cfg.defaults?.model || opts.defaultModel || "gpt-4o-mini";
        return { providerId, model };
      }
    }
  }

  // Default provider selection logic
  const providers = cfg.providers || {};
  const providerId = cfg.defaults?.providerId
    ? cfg.defaults.providerId
    : providers["default"]
    ? "default"
    : Object.keys(providers).length === 1
    ? Object.keys(providers)[0]
    : "default";
  const model = explicitModel || cfg.defaults?.model || opts.defaultModel || "gpt-4o-mini";
  return { providerId, model };
}
