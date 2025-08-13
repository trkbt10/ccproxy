import vm from "node:vm";
import { dirname, join, resolve } from "node:path";
import type { DynamicToolRuntime, ToolRef, ToolMeta } from "../types";

function isRuntime(v: unknown): v is DynamicToolRuntime {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.execute === "function" &&
    (o.description === undefined || typeof o.description === "string")
  );
}

function isToolMeta(v: unknown): v is ToolMeta {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.entry === "string" && typeof o.exportName === "string";
}

export async function loadRuntimeFromStorage(ref: ToolRef): Promise<DynamicToolRuntime> {
  const meta = await ref.storage.getMeta(ref);
  if (!isToolMeta(meta)) throw new Error("tool_meta_not_found");

  const moduleCache = new Map<string, vm.SourceTextModule>();
  const prefix = `mem://${meta.name}/`;
  async function loadModule(relPath: string): Promise<vm.SourceTextModule> {
    const id = join(prefix, relPath);
    if (moduleCache.has(id)) return moduleCache.get(id)!;
    const code = await ref.storage.readFile(ref, relPath);
    const mod = new vm.SourceTextModule(code);
    moduleCache.set(id, mod);
    await mod.link(async (specifier, referencing) => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw new Error(`only_relative_imports_supported: ${specifier}`);
      }
      const refId = referencing.identifier; // mem://.../<path>
      const refPath = refId.split("mem://")[1] || "";
      const parts = refPath.split("/");
      parts.shift(); // drop tool name
      const cur = parts.join("/");
      const parentDir = dirname(cur);
      const next = resolve("/" + parentDir, specifier).slice(1); // drop leading '/'
      return loadModule(next.endsWith(".js") ? next : `${next}.js`);
    });
    await mod.evaluate();
    return mod;
  }

  const main = await loadModule(meta.entry);
  const exp = (main.namespace as unknown as Record<string, unknown>)[meta.exportName];
  if (!isRuntime(exp)) throw new Error("invalid_runtime_export");
  return exp;
}
