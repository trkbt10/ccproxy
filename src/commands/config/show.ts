import { existsSync } from "node:fs";
import { expandConfig } from "../../config/expansion";
import { readConfigRaw } from "../../utils/json/config-io";
import { getConfigPath, hasFlag } from "../utils";

export async function cmdConfigShow(): Promise<void> {
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  const output = hasFlag("expanded") ? expandConfig(raw) : raw;
  console.log(JSON.stringify(output, null, 2));
}