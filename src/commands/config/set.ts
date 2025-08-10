import { existsSync } from "node:fs";
import { readConfigRaw, writeConfigRaw } from "../../utils/json/config-io";
import { parseValueLiteral } from "../../utils/json/parse";
import { setByPath } from "../../utils/path/object-path";
import { getConfigPath } from "../utils";

export async function cmdConfigSet(pathArg?: string, valueArg?: string): Promise<void> {
  if (!pathArg || typeof valueArg === "undefined") {
    console.error("Usage: config set <path> <value>");
    process.exit(1);
  }
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  const value = parseValueLiteral(valueArg);
  setByPath(raw, pathArg, value);
  await writeConfigRaw(filePath, raw);
  console.log(`Updated ${pathArg} in ${filePath}`);
}