import { readConfigRaw } from "../../../../utils/json/config-io";
import { getByPath } from "../../../../utils/path/object-path";
import type { ConfigOptions } from "../../types";
import { ensureArgument, ensureConfigExists } from "../../utils/errors";

export async function cmdConfigGet(pathArg: string | undefined, options: ConfigOptions): Promise<void> {
  ensureArgument(pathArg, "Missing <path>. Example: providers.default.apiKey");
  const filePath = options.config;
  ensureConfigExists(filePath);
  const raw = await readConfigRaw(filePath);
  const value = getByPath(raw, pathArg);
  console.log(JSON.stringify(value, null, 2));
}

