import { readFile } from "node:fs/promises";
import type { RoutingConfig } from "../config/types";
import { expandConfig } from "../config/expansion";
import { resolveConfigPath } from "../config/paths";
import { setByPath } from "../utils/path/object-path";

/**
 * Load routing config with custom path and overrides
 */
export async function loadRoutingConfigWithOverrides(
  configPath?: string,
  configOverrides?: Array<{ key: string; value: string }>
): Promise<RoutingConfig> {
  // Use provided path or default
  const resolvedPath = configPath || resolveConfigPath();
  
  // Load config file
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  
  // Apply overrides if provided
  if (configOverrides && configOverrides.length > 0) {
    for (const override of configOverrides) {
      setByPath(parsed, override.key, override.value);
    }
  }
  
  // Expand and validate
  const expanded = expandConfig(parsed);
  return expanded;
}

/**
 * Create a config loader with specific options
 */
export function createConfigLoader(
  configPath?: string,
  configOverrides?: Array<{ key: string; value: string }>
) {
  let cachedConfig: RoutingConfig | null = null;
  let loadingPromise: Promise<RoutingConfig> | null = null;
  
  return async function loadConfig(): Promise<RoutingConfig> {
    if (cachedConfig) {
      return cachedConfig;
    }
    
    if (loadingPromise) {
      return loadingPromise;
    }
    
    loadingPromise = (async () => {
      try {
        const config = await loadRoutingConfigWithOverrides(configPath, configOverrides);
        cachedConfig = config;
        return config;
      } finally {
        loadingPromise = null;
      }
    })();
    
    return loadingPromise;
  };
}