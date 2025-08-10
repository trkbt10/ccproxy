import path from "node:path";
import { resolveConfigPath } from "../config/paths";

export function getArgFlag(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0) {
    return process.argv[idx + 1];
  }
  const pref = `--${name}=`;
  const m = process.argv.find((a) => a.startsWith(pref));
  if (m) {
    return m.slice(pref.length);
  }
  return undefined;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function getConfigPath(): string {
  const fromArg = getArgFlag("config");
  if (fromArg) {
    return path.resolve(fromArg);
  }
  return resolveConfigPath();
}