#!/usr/bin/env bun
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distPath = join(__dirname, '..', 'dist', 'cli.js');
const srcPath = join(__dirname, '..', 'src', 'cli.ts');

async function main() {
  if (existsSync(distPath)) {
    await import(distPath);
    return;
  }
  if (existsSync(srcPath)) {
    await import(srcPath);
    return;
  }
  console.error("ccproxy: CLI entry not found. Build with 'bun run build:cli' or run via 'bun run src/cli.ts'.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
