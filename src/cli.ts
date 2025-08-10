#!/usr/bin/env bun
import { cmdServe } from "./commands/serve";
import { cmdConfigInit } from "./commands/config/init";
import { cmdConfigShow } from "./commands/config/show";
import { cmdConfigList } from "./commands/config/list";
import { cmdConfigGet } from "./commands/config/get";
import { cmdConfigSet } from "./commands/config/set";
import { getBanner } from "./utils/logo/banner"; // added static import
import { loadRoutingConfigOnce } from "./execution/routing-config";

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
      if (subcmd) {
        // User provided custom text, use it as-is - no config needed
        console.log(getBanner(subcmd.toUpperCase(), { color: "cyan" }));
      } else {
        // Default banner - only load config if we need to show provider info
        console.log(getBanner("CCPROXY", { color: "cyan" }));
        console.log(); // Add line spacing after banner
        
        // Only load config if --with-provider flag is passed
        if (rest.includes("--with-provider")) {
          const cfg = await loadRoutingConfigOnce();
          const defaultProvider = cfg.providers?.default;
          if (defaultProvider) {
            const providerName = defaultProvider.type || "openai";
            console.log(`\x1b[36m+ ${providerName.toUpperCase()}\x1b[0m`);
          }
        }
      }
      process.exit(0); // Exit immediately after banner
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
