import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import { createConfigLoader } from "../../execution/routing-config-with-overrides";
import { printStartupInfo } from "./utils/startup-info";
import { extractEndpoints } from "./utils/hono-endpoints";
import { printBanner, printProviderInfoLine } from "../cli/banner";

async function printBannerWithProvider(apiMode?: "claude" | "openai" | "gemini"): Promise<void> {
  // API-specific banner configurations
  const configs = {
    claude: {
      text: "CLAUDE",
      color: "cyan" as const, // Anthropic's cyan/blue
    },
    openai: {
      text: "OPENAI",
      color: "green" as const, // OpenAI's green
    },
    gemini: {
      text: "GEMINI",
      color: "blue" as const, // Google's blue (changed from magenta)
    },
  };

  const config = configs[apiMode || "claude"];
  printBanner(config.text, config.color);
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
  apiMode?: "claude" | "openai" | "gemini";
}

/**
 * Starts a Node server for a given Hono app with unified startup logs.
 * Used by both CLI `serve` and the Claude-focused server entry.
 */
export async function startHonoServer(app: Hono, opts?: ServerOptions): Promise<void> {
  const port = resolvePort(opts?.port ?? undefined);

  // Create config loader with overrides if provided
  const loadConfig =
    opts?.configPath || opts?.configOverrides
      ? createConfigLoader(opts.configPath, opts.configOverrides)
      : loadRoutingConfigOnce;

  serve({ fetch: app.fetch, port }, async (info) => {
    await printBannerWithProvider(opts?.apiMode);
    const cfg = await loadConfig();
    const eps = extractEndpoints(app);
    await printStartupInfo(info.port, cfg, eps);
  });
}
