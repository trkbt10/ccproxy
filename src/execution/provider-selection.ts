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
  const explicitModel =
    typeof opts.explicitModel === "string" ? opts.explicitModel : undefined;
  const toolNames = Array.isArray(opts.toolNames) ? opts.toolNames : [];

  // Try to honor tool-defined responses_model steps first
  const selectedFromTools = selectFromTools(cfg, toolNames);
  if (selectedFromTools) {
    const providerId = selectedFromTools.providerId ?? defaultProviderId(cfg);
    if (!providerId) {
      throw new Error("Unable to resolve providerId from tool or config");
    }
    const providerModel = cfg.providers?.[providerId]?.model;
    const model =
      explicitModel ??
      selectedFromTools.model ??
      providerModel ??
      cfg.defaults?.model ??
      opts.defaultModel;
    if (!model) {
      throw new Error(
        `Model not specified for provider '${providerId}'. Please set a tool step model, pass explicitModel, or configure a default model.`
      );
    }
    return { providerId, model };
  }

  // Fallback to defaults
  const providerId = defaultProviderId(cfg);
  if (!providerId) {
    throw new Error("No provider configured. Set defaults.providerId or define a provider.");
  }
  const providerModel = cfg.providers?.[providerId]?.model;
  const model = explicitModel ?? providerModel ?? cfg.defaults?.model ?? opts.defaultModel;
  if (!model) {
    throw new Error(
      `Model not specified for provider '${providerId}'. Please set provider.model, defaults.model, or pass explicitModel.`
    );
  }
  return { providerId, model };
}

// Find the first tool step that specifies a responses_model
function selectFromTools(
  cfg: RoutingConfig,
  toolNames: string[]
): { providerId?: string; model?: string } | undefined {
  for (const name of toolNames) {
    const steps = planToolExecution(cfg, name, undefined);
    const found = steps.find((s) => s.kind === "responses_model");
    if (found && found.kind === "responses_model") {
      return { providerId: found.providerId, model: found.model };
    }
  }
  return undefined;
}

// Compute the default provider id in a clear order of precedence
function defaultProviderId(cfg: RoutingConfig): string | undefined {
  const providers = cfg.providers ?? {};

  // 1) Explicit default in config
  if (cfg.defaults?.providerId) return cfg.defaults.providerId;

  // 2) Named provider "default" exists
  if (providers["default"]) return "default";

  // 3) Only one provider configured
  const keys = Object.keys(providers);
  if (keys.length === 1) return keys[0];

  // 4) Fallback
  return undefined;
}
