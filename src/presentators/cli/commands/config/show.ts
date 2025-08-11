import { expandConfig } from "../../../../config/expansion";
import { readConfigRaw } from "../../../../utils/json/config-io";
import type { ConfigOptions } from "../../types";
import { ensureConfigExists } from "../../utils/errors";

export async function cmdConfigShow(options: ConfigOptions): Promise<void> {
  const filePath = options.config;
  ensureConfigExists(filePath);
  const raw = await readConfigRaw(filePath);
  const output = options.expanded ? expandConfig(raw) : raw;
  console.log(JSON.stringify(output, null, 2));
}

