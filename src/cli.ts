#!/usr/bin/env bun
import { cmdServe } from "./commands/serve";
import { cmdConfigInit } from "./commands/config/init";
import { cmdConfigShow } from "./commands/config/show";
import { cmdConfigList } from "./commands/config/list";
import { cmdConfigGet } from "./commands/config/get";
import { cmdConfigSet } from "./commands/config/set";

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
