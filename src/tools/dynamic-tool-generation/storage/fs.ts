import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import type { GenerationPlan, ToolKey, ToolMeta, ToolRef, ToolStorage } from "../types";

function toKeyDir(key: ToolKey): string {
  const fn = key.functionName.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const sh = key.schemaHash ? key.schemaHash.replace(/[^a-fA-F0-9]+/g, "").slice(0, 16) : "nosha";
  const v = key.variant ? key.variant.replace(/[^a-zA-Z0-9_-]+/g, "-") : "default";
  return `${fn}__${sh}__${v}`.toLowerCase();
}

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function safeJoin(base: string, rel: string): string {
  const cleaned = rel.replace(/^\/+/, "");
  return resolve(base, cleaned);
}

export function createFileSystemStorage(root?: string): ToolStorage {
  const baseRoot = resolve(process.cwd(), root || "src/tools/dynamic-tool-generation/generated");

  async function save(plan: GenerationPlan, key: ToolKey, namespace: string[]): Promise<ToolRef> {
    const dir = resolve(baseRoot, ...namespace, toKeyDir(key));
    ensureDir(dir);

    for (const a of plan.files) {
      const abs = safeJoin(dir, a.path);
      ensureDir(dirname(abs));
      writeFileSync(abs, a.content, "utf8");
    }
    if (plan.testFiles) {
      for (const a of plan.testFiles) {
        const abs = safeJoin(dir, a.path);
        ensureDir(dirname(abs));
        writeFileSync(abs, a.content, "utf8");
      }
    }
    // Save metadata for lookup
    const meta: ToolMeta = {
      name: plan.tool.name,
      description: plan.tool.description,
      entry: plan.tool.entry,
      exportName: plan.tool.exportName,
    };
    writeFileSync(join(dir, "__meta.json"), JSON.stringify(meta), "utf8");
    return { storage: api, key, namespace };
  }

  async function readFile(ref: ToolRef, relPath: string): Promise<string> {
    const dir = resolve(baseRoot, ...ref.namespace, toKeyDir(ref.key));
    const abs = safeJoin(dir, relPath);
    return readFileSync(abs, "utf8");
    
  }

  async function getMeta(ref: ToolRef): Promise<ToolMeta | undefined> {
    const dir = resolve(baseRoot, ...ref.namespace, toKeyDir(ref.key));
    const metaPath = join(dir, "__meta.json");
    if (!existsSync(metaPath)) return undefined;
    const txt = readFileSync(metaPath, "utf8");
    try {
      const obj = JSON.parse(txt) as unknown;
      if (
        obj &&
        typeof obj === "object" &&
        typeof (obj as { entry?: unknown }).entry === "string" &&
        typeof (obj as { exportName?: unknown }).exportName === "string"
      ) {
        const rec = obj as Record<string, unknown>;
        return {
          name: String(rec.name || "dynamic_tool"),
          description: typeof rec.description === "string" ? rec.description : undefined,
          entry: String(rec.entry),
          exportName: String(rec.exportName),
        };
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  const api: ToolStorage = { save, readFile, getMeta };
  return api;
}
