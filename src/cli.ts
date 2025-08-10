#!/usr/bin/env bun
import { serve } from "@hono/node-server";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import app from "./index";
import { expandConfig } from "./config/expansion";
import type { RoutingConfig } from "./config/types";
import { printCcproxyBanner } from "./utils/logo/banner";
import { resolveConfigPath } from "./config/paths";
import { loadRoutingConfigOnce } from "./execution/routing-config";
import { printStartupInfo } from "./utils/info/startup-info";
import { extractEndpoints } from "./utils/info/hono-endpoints";

function usage(): void {
  const invoked = process.argv[1] || "ccproxy";
  const base = invoked.includes("ccproxy") ? "./ccproxy" : "ccproxy";
  const msg = `
ccproxy CLI

Usage:
  ${base} serve [--port 8082] [--config ./ccproxy.config.json]
  ${base} config init [--config ./ccproxy.config.json] [--force]
  ${base} config show [--config ./ccproxy.config.json] [--expanded]
  ${base} config list [--config ./ccproxy.config.json]
  ${base} config get <path> [--config ./ccproxy.config.json]
  ${base} config set <path> <value> [--config ./ccproxy.config.json]

Examples:
  ${base} serve --port 8082
  ${base} config init
  ${base} config show --expanded
  ${base} config list
  ${base} config get providers.default.apiKey
  ${base} config set logging.enabled true
`;
  console.log(msg);
}

function getArgFlag(name: string): string | undefined {
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

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function getConfigPath(): string {
  const fromArg = getArgFlag("config");
  if (fromArg) {
    return path.resolve(fromArg);
  }
  return resolveConfigPath();
}

async function readConfigRaw(filePath: string): Promise<RoutingConfig> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return parsed as RoutingConfig;
}

async function writeConfigRaw(filePath: string, data: RoutingConfig): Promise<void> {
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(filePath, json, "utf8");
}

function parseValueLiteral(text: string): unknown {
  // Try JSON parse first
  try {
    return JSON.parse(text);
  } catch {}
  // Fallback to common literals
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  if (!Number.isNaN(Number(text))) {
    return Number(text);
  }
  // Keep as string
  return text;
}

function getByPath<T extends object>(obj: T, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, obj as unknown);
}

function setByPath<T extends object>(obj: T, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  let cur: Record<string, unknown> = obj as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") {
      cur[k] = {} as unknown;
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function listSummary(cfg: RoutingConfig): Record<string, unknown> {
  const providers = Object.keys(cfg.providers || {});
  const tools = ((cfg.tools as Array<{ name: string }> | undefined) || []).map(
    (t) => t.name
  );
  return {
    logging: cfg.logging ? { ...cfg.logging } : undefined,
    providers: providers,
    tools: tools,
  };
}

async function cmdServe(): Promise<void> {
  const portStr = getArgFlag("port");
  const port = portStr ? parseInt(portStr, 10) : parseInt(process.env.PORT || "8082", 10);
  printCcproxyBanner();
  serve({ fetch: app.fetch, port }, async (info) => {
    const cfg = await loadRoutingConfigOnce();
    const eps = extractEndpoints(app as any);
    await printStartupInfo(info.port, cfg, eps);
  });
}

async function cmdConfigShow(): Promise<void> {
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  const output = hasFlag("expanded") ? expandConfig(raw) : raw;
  console.log(JSON.stringify(output, null, 2));
}

async function cmdConfigList(): Promise<void> {
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  console.log(JSON.stringify(listSummary(raw), null, 2));
}

async function cmdConfigGet(pathArg?: string): Promise<void> {
  if (!pathArg) {
    console.error("Missing <path>. Example: providers.default.apiKey");
    process.exit(1);
  }
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  const value = getByPath(raw, pathArg);
  console.log(JSON.stringify(value, null, 2));
}

async function cmdConfigSet(pathArg?: string, valueArg?: string): Promise<void> {
  if (!pathArg || typeof valueArg === "undefined") {
    console.error("Usage: config set <path> <value>");
    process.exit(1);
  }
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = await readConfigRaw(filePath);
  const value = parseValueLiteral(valueArg);
  setByPath(raw, pathArg, value);
  await writeConfigRaw(filePath, raw);
  console.log(`Updated ${pathArg} in ${filePath}`);
}

function defaultConfig(): RoutingConfig {
  return {
    logging: {
      enabled: true,
      eventsEnabled: false,
      dir: "./logs",
    },
    // Providers can be configured later; "default" is synthesized from env when needed
    providers: {},
    tools: [],
  };
}

async function cmdConfigInit(): Promise<void> {
  const filePath = getConfigPath();
  if (existsSync(filePath) && !hasFlag("force")) {
    console.error(`Config already exists: ${filePath} (use --force to overwrite)`);
    process.exit(1);
  }
  const cfg = defaultConfig();
  await writeConfigRaw(filePath, cfg);
  console.log(`Initialized config at ${filePath}`);
}

async function main(): Promise<void> {
  const [, , cmd, subcmd, ...rest] = process.argv;
  switch (cmd) {
    case "serve":
      await cmdServe();
      return;
    case "banner": {
      const text = subcmd || "CCPROXY";
      const { getBanner } = await import("./utils/logo/banner");
      console.log(getBanner(text));
      return;
    }
    case "config": {
      switch (subcmd) {
        case "init":
          await cmdConfigInit();
          return;
        case "show":
          await cmdConfigShow();
          return;
        case "list":
          await cmdConfigList();
          return;
        case "get":
          await cmdConfigGet(rest[0]);
          return;
        case "set":
          await cmdConfigSet(rest[0], rest[1]);
          return;
        default:
          usage();
          process.exit(1);
      }
    }
    default:
      usage();
      process.exit(cmd ? 1 : 0);
  }
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
