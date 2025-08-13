import type { GenerationPlan, ToolKey, ToolMeta, ToolRef, ToolStorage } from "../types";

type Stored = {
  meta: ToolMeta;
  files: Map<string, string>;
};

function keyId(key: ToolKey, ns: string[]): string {
  return `${ns.join("/")}::${key.functionName}::${key.schemaHash || "nosha"}::${key.variant || "default"}`;
}

export function createMemoryStorage(): ToolStorage {
  const mem = new Map<string, Stored>();

  async function save(plan: GenerationPlan, key: ToolKey, namespace: string[]): Promise<ToolRef> {
    const files = new Map<string, string>();
    for (const f of plan.files) files.set(f.path, f.content);
    if (plan.testFiles) for (const f of plan.testFiles) files.set(f.path, f.content);
    const meta: ToolMeta = {
      name: plan.tool.name,
      description: plan.tool.description,
      entry: plan.tool.entry,
      exportName: plan.tool.exportName,
    };
    mem.set(keyId(key, namespace), { meta, files });
    return { storage: api, key, namespace };
  }

  async function readFile(ref: ToolRef, relPath: string): Promise<string> {
    const found = mem.get(keyId(ref.key, ref.namespace));
    const s = found;
    if (!s) throw new Error("tool_not_found");
    const v = s.files.get(relPath);
    if (typeof v !== "string") throw new Error("file_not_found");
    return v;
  }

  async function getMeta(ref: ToolRef): Promise<ToolMeta | undefined> {
    return mem.get(keyId(ref.key, ref.namespace))?.meta;
  }

  const api: ToolStorage = { save, readFile, getMeta };
  return api;
}
