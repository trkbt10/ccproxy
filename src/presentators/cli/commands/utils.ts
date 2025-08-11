import path from "node:path";
import { resolveConfigPath } from "../../../config/paths";

export function getArgFlag(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function getConfigPath(): string {
  const cfgArg = getArgFlag("config");
  if (cfgArg) return path.resolve(cfgArg);
  return resolveConfigPath();
}
