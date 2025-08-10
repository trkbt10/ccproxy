import { existsSync } from "node:fs";
import { readConfigRaw } from "../../utils/json/config-io";
import { getByPath } from "../../utils/path/object-path";
import { getConfigPath } from "../utils";

export async function cmdConfigGet(pathArg?: string): Promise<void> {
  if (!pathArg) {
    console.error("Missing <path>. Example: providers.default.apiKey");
    process.exit(1);
  }
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  const value = getByPath(raw, pathArg);
  console.log(JSON.stringify(value, null, 2));
}