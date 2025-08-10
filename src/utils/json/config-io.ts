import { readFile, writeFile } from "node:fs/promises";
import type { RoutingConfig } from "../../config/types";

/**
 * Read a routing configuration file from disk
 * 
 * @param filePath - Path to the configuration file
 * @returns The parsed routing configuration
 * @throws If the file cannot be read or parsed as JSON
 */
export async function readConfigRaw(filePath: string): Promise<RoutingConfig> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return parsed as RoutingConfig;
}

/**
 * Write a routing configuration to disk
 * 
 * @param filePath - Path to write the configuration file
 * @param data - The routing configuration to write
 * @throws If the file cannot be written
 */
export async function writeConfigRaw(filePath: string, data: RoutingConfig): Promise<void> {
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(filePath, json, "utf8");
}