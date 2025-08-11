import type { RoutingConfig } from "../../../../config/types";
import { writeConfigRaw } from "../../../../utils/json/config-io";
import type { ConfigOptions } from "../../types";
import { checkFileExistsWithForce } from "../../utils/errors";

function defaultConfig(): RoutingConfig {
  return {
    logging: { enabled: true, eventsEnabled: false, dir: "./logs" },
    providers: {},
    tools: [],
  };
}

export async function cmdConfigInit(options: ConfigOptions): Promise<void> {
  const filePath = options.config;
  checkFileExistsWithForce(
    filePath,
    options.force || false,
    `Config already exists: ${filePath} (use --force to overwrite)`
  );
  const cfg = defaultConfig();
  await writeConfigRaw(filePath, cfg);
  console.log(`Initialized config at ${filePath}`);
}

