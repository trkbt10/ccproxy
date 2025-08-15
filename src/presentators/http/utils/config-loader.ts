import type { ServerOptions } from "../server";
import { loadRoutingConfigOnce } from "../../../execution/routing-config";
import { createConfigLoader } from "../../../execution/routing-config-with-overrides";
import type { RoutingConfig } from "../../../config/types";

// Unified helper to obtain a RoutingConfig promise based on optional overrides.
export function getRoutingConfigPromise(
  opts?: Pick<ServerOptions, "configPath" | "configOverrides">
): Promise<RoutingConfig> {
  const load = opts?.configPath || opts?.configOverrides
    ? createConfigLoader(opts.configPath, opts.configOverrides)
    : loadRoutingConfigOnce;
  return load();
}

