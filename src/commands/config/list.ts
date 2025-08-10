import { existsSync } from "node:fs";
import type { RoutingConfig } from "../../config/types";
import { readConfigRaw } from "../../utils/json/config-io";
import { getConfigPath } from "../utils";

function listSummary(cfg: RoutingConfig): Record<string, unknown> {
  const providers = Object.keys(cfg.providers || {});
  const tools = ((cfg.tools as Array<{ name: string }> | undefined) || []).map(
    (t) => t.name
  );
  return {
    logging: cfg.logging ? { ...cfg.logging } : undefined,
    providers: providers,
    tools: tools,
  };
}

export async function cmdConfigList(): Promise<void> {
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  console.log(JSON.stringify(listSummary(raw), null, 2));
}