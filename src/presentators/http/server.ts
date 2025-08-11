import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import { printStartupInfo } from "./utils/startup-info";
import { extractEndpoints } from "./utils/hono-endpoints";
import { printBanner, printProviderInfoLine } from "../cli/banner";

async function printBannerWithProvider(): Promise<void> {
  printBanner("CCPROXY", "cyan");
  console.log();
  await printProviderInfoLine();
  console.log();
}

export function resolvePort(portFromArg?: string | number): number {
  if (typeof portFromArg === "number") return portFromArg;
  if (typeof portFromArg === "string" && portFromArg.trim()) {
    const n = parseInt(portFromArg, 10);
    if (!Number.isNaN(n)) return n;
  }
  const env = parseInt(process.env.PORT || "8082", 10);
  return Number.isNaN(env) ? 8082 : env;
}

export interface ServerOptions {
  port?: number | string;
  configPath?: string;
  configOverrides?: Array<{ key: string; value: string }>;
}

/**
 * Starts a Node server for a given Hono app with unified startup logs.
 * Used by both CLI `serve` and the Claude-focused server entry.
 */
export async function startHonoServer(app: Hono, opts?: ServerOptions): Promise<void> {
  const port = resolvePort(opts?.port ?? undefined);
  
  // TODO: Apply configPath and configOverrides to routing config loading
  // For now, we'll implement this in a follow-up
  
  serve({ fetch: app.fetch, port }, async (info) => {
    await printBannerWithProvider();
    const cfg = await loadRoutingConfigOnce();
    const eps = extractEndpoints(app);
    await printStartupInfo(info.port, cfg, eps);
  });
}
