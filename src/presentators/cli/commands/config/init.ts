import { existsSync } from "node:fs";
import type { RoutingConfig } from "../../../../config/types";
import { writeConfigRaw } from "../../../../utils/json/config-io";
import { getConfigPath, hasFlag } from "../utils";

function defaultConfig(): RoutingConfig {
  return {
    logging: { enabled: true, eventsEnabled: false, dir: "./logs" },
    providers: {},
    tools: [],
  };
}

export async function cmdConfigInit(): Promise<void> {
  const filePath = getConfigPath();
  if (existsSync(filePath) && !hasFlag("force")) {
    console.error(`Config already exists: ${filePath} (use --force to overwrite)`);
    process.exit(1);
  }
  const cfg = defaultConfig();
  await writeConfigRaw(filePath, cfg);
  console.log(`Initialized config at ${filePath}`);
}

