import { readConfigRaw, writeConfigRaw } from "../../../../utils/json/config-io";
import { parseValueLiteral } from "../../../../utils/json/parse";
import { setByPath } from "../../../../utils/path/object-path";
import type { ConfigOptions } from "../../types";
import { ensureArgument, ensureConfigExists } from "../../utils/errors";

export async function cmdConfigSet(pathArg: string | undefined, valueArg: string | undefined, options: ConfigOptions): Promise<void> {
  ensureArgument(pathArg, "Usage: config set <path> <value>");
  ensureArgument(valueArg, "Usage: config set <path> <value>");
  const filePath = options.config;
  ensureConfigExists(filePath);
  const raw = await readConfigRaw(filePath);
  const value = parseValueLiteral(valueArg);
  setByPath(raw, pathArg, value);
  await writeConfigRaw(filePath, raw);
  console.log(`Updated ${pathArg} in ${filePath}`);
}

