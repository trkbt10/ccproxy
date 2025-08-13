import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { Mode, Line, ProviderInstance, Context } from "./providers/types";
import { registry } from "./providers/index";

type ProviderName = string;

function buildProvidersFromEnv(selected: ProviderName[]): ProviderInstance[] {
  const selectedSet = new Set(selected);
  return registry
    .filter((f) => selectedSet.has(f.name))
    .map((f) => f.buildFromEnv())
    .filter((x): x is ProviderInstance => Boolean(x));
}

async function ensureFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, "", { encoding: "utf8" });
}

async function writeLine(filePath: string, obj: Line): Promise<void> {
  const line = JSON.stringify(obj) + "\n";
  await appendFile(filePath, line, { encoding: "utf8" });
}

// Default models are provided by each provider factory

async function writeJSONL(
  baseDir: string,
  providerType: string,
  mode: Mode,
  context: Context,
  lines: Line[]
): Promise<void> {
  const file = join(baseDir, providerType, mode, `${context}.jsonl`);
  await ensureFile(file);
  for (const l of lines) await writeLine(file, l);
}

async function main() {
  const baseDir = "__mocks__/llm-responses";
  // Minimal inline CLI parsing for providers
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { provider: { type: "string", multiple: true, short: "p" } },
  });
  const raw = values.provider as undefined | string | string[];
  const selected: ProviderName[] = (() => {
    const allowed: ProviderName[] = registry.map((r) => r.name);
    if (!raw) return allowed;
    const list = (Array.isArray(raw) ? raw : [raw])
      .flatMap((v) => v.split(","))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const uniq = Array.from(new Set(list)) as string[];
    const sel = uniq.filter((p) => (allowed as string[]).includes(p)) as ProviderName[];
    const invalid = uniq.filter((p) => !(allowed as string[]).includes(p));
    if (invalid.length) console.warn(`Ignoring unknown providers: ${invalid.join(", ")}`);
    return sel.length ? sel : allowed;
  })();
  const providers = buildProvidersFromEnv(selected);
  if (providers.length === 0) {
    console.error(`No selected providers configured via env. Selected: ${selected.join(", ")}. Set relevant API keys.`);
    process.exit(1);
  }
  for (const p of providers) {
    const model = p.defaultModel;
    if (!p.nativeCases) {
      console.error(`Provider ${p.name} does not implement nativeCases(); aborting.`);
      process.exit(1);
    }
    const cases = await p.nativeCases(model);
    for (const c of cases) {
      try {
        const line = await c.run();
        await writeJSONL(baseDir, p.name, c.mode, c.context, [line]);
        console.log(`Wrote ${p.name}/${c.mode}/${c.context}.jsonl (${c.api})`);
      } catch (e) {
        const ts = new Date().toISOString();
        const errorLine: Line = {
          ts,
          provider: p.name,
          api: c.api,
          mode: c.mode,
          context: c.context,
          request: c.buildRequest(),
          error: { message: e instanceof Error ? e.message : String(e) },
        };
        await writeJSONL(baseDir, p.name, c.mode, c.context, [errorLine]);
        console.log(`Wrote error ${p.name}/${c.mode}/${c.context}.jsonl (${c.api})`);
      }
    }
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
