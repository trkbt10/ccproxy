import type { RoutingConfig } from "../../../../config/types";
import { readConfigRaw } from "../../../../utils/json/config-io";
import type { ConfigOptions } from "../../types";
import { ensureConfigExists } from "../../utils/errors";

function listSummary(cfg: RoutingConfig): Record<string, unknown> {
  const providers = Object.keys(cfg.providers || {});
  const tools = ((cfg.tools as Array<{ name: string }> | undefined) || []).map((t) => t.name);
  return { logging: cfg.logging ? { ...cfg.logging } : undefined, providers, tools };
}

export async function cmdConfigList(options: ConfigOptions): Promise<void> {
  const filePath = options.config;
  ensureConfigExists(filePath);
  const raw = await readConfigRaw(filePath);
  console.log(JSON.stringify(listSummary(raw), null, 2));
}

