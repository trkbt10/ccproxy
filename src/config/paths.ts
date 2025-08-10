import { existsSync } from "node:fs";
import path from "node:path";

export function resolveConfigPath(cwd: string = process.cwd()): string {
  if (process.env.ROUTING_CONFIG_PATH) {
    return path.resolve(process.env.ROUTING_CONFIG_PATH);
  }
  const candidates = [
    path.join(cwd, "ccproxy.config.json"),
    path.join(cwd, "config", "ccproxy.config.json"),
    path.join(cwd, "config", "routing.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  return candidates[0];
}

