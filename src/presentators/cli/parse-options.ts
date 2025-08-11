import { getArgFlag, hasFlag } from "./commands/utils";
import { resolveConfigPath } from "../../config/paths";
import type { ServeOptions, ConfigOptions } from "./types";

export function parseServeOptions(): ServeOptions {
  const portStr = getArgFlag("port");
  const apiMode = getArgFlag("api") || (hasFlag("openai") ? "openai" : undefined);
  const configArg = getArgFlag("config");
  
  // Parse config overrides (-c or --config-override)
  const configOverrides: Array<{ key: string; value: string }> = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" || args[i] === "--config-override") {
      const override = args[i + 1];
      if (override && override.includes("=")) {
        const [key, ...valueParts] = override.split("=");
        configOverrides.push({ key, value: valueParts.join("=") });
      }
    }
  }

  return {
    port: portStr,
    api: (apiMode?.toLowerCase() as "claude" | "openai") || "claude",
    config: configArg || resolveConfigPath(),
    configOverrides: configOverrides.length > 0 ? configOverrides : undefined,
  };
}

export function parseConfigOptions(): ConfigOptions {
  const configArg = getArgFlag("config");
  return {
    config: configArg || resolveConfigPath(),
    expanded: hasFlag("expanded"),
    force: hasFlag("force"),
  };
}