#!/usr/bin/env bun
import { cmdServe } from "./commands/serve";
import { cmdConfigInit } from "./commands/config/init";
import { cmdConfigShow } from "./commands/config/show";
import { cmdConfigList } from "./commands/config/list";
import { cmdConfigGet } from "./commands/config/get";
import { cmdConfigSet } from "./commands/config/set";
import { getBanner } from "../../utils/logo/banner";
import { printProviderInfoLine } from "./banner";
import { parseServeOptions, parseConfigOptions } from "./parse-options";

function usage(): void {
  const invoked = process.argv[1] || "ccproxy";
  const base = invoked.includes("ccproxy") ? "./ccproxy" : "ccproxy";
  const msg = `
ccproxy CLI

Usage:
  ${base} serve [--port 8082|8085] [--api claude|openai] [--config ./ccproxy.config.json]
  ${base} config init [--config ./ccproxy.config.json] [--force]
  ${base} config show [--config ./ccproxy.config.json] [--expanded]
  ${base} config list [--config ./ccproxy.config.json]
  ${base} config get <path> [--config ./ccproxy.config.json]
  ${base} config set <path> <value> [--config ./ccproxy.config.json]

Options:
  --port <number>     Port to listen on (default: 8082 for claude, 8085 for openai)
  --api <mode>        API mode: "claude" (default) or "openai"
  --openai            Shorthand for "--api openai"
  --config <path>     Path to ccproxy config JSON (auto-detected if omitted)
  --expanded          Expand env vars in config output (for "config show")
  --force             Overwrite existing config (for "config init")

Examples:
  ${base} serve --port 8082
  ${base} serve --api openai --port 8085
  ${base} serve --api openai
  ${base} config init
  ${base} config show --expanded
  ${base} config list
  ${base} config get providers.default.apiKey
  ${base} config set logging.enabled true
`;
  console.log(msg);
}

export async function runCli(argv: string[]): Promise<void> {
  const [, , cmd, subcmd, ...rest] = argv;
  switch (cmd) {
    case "serve": {
      const options = parseServeOptions();
      await cmdServe(options);
      return;
    }
    case "banner": {
      if (subcmd) {
        console.log(getBanner(subcmd.toUpperCase(), { color: "cyan" }));
      } else {
        console.log(getBanner("CCPROXY", { color: "cyan" }));
        console.log();
        if (rest.includes("--with-provider")) {
          await printProviderInfoLine();
        }
      }
      process.exit(0);
    }
    case "config": {
      const configOptions = parseConfigOptions();
      switch (subcmd) {
        case "init":
          await cmdConfigInit(configOptions);
          return;
        case "show":
          await cmdConfigShow(configOptions);
          return;
        case "list":
          await cmdConfigList(configOptions);
          return;
        case "get":
          await cmdConfigGet(rest[0], configOptions);
          return;
        case "set":
          await cmdConfigSet(rest[0], rest[1], configOptions);
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
