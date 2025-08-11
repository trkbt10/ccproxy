#!/usr/bin/env bun
import { runCli } from "./presentators/cli/cli";

runCli(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
