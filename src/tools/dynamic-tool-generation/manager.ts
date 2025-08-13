import type { Provider } from "../../config/types";
import { loadRuntimeFromStorage } from "./runtime/loader";
import { createFileSystemStorage } from "./storage/fs";
import { generateDynamicToolForScenario } from "./dynamic-agent";
import type { DynamicToolRuntime, RuntimeExec, ToolKey, ToolMeta, ToolRef, ToolScenario, ToolStorage } from "./types";
import { makeToolId } from "./types";

const runtimeCache = new Map<string, DynamicToolRuntime>();

export type PrepareOptions = {
  provider: Provider;
  model: string;
  storage?: ToolStorage;
  signal?: AbortSignal;
};

export async function prepareToolForScenario(
  scenario: ToolScenario,
  opts: PrepareOptions
): Promise<{ exec: RuntimeExec; key: ToolKey; meta: ToolMeta }> {
  const storage = opts.storage || createFileSystemStorage();
  const id = makeToolId(scenario.namespace, scenario.key);

  // Build a ref for lookup
  const ref: ToolRef = { storage, key: scenario.key, namespace: scenario.namespace };

  // Cache hit?
  const cached = runtimeCache.get(id);
  if (cached) {
    const meta = await storage.getMeta(ref);
    if (!meta) throw new Error("tool_meta_not_found");
    return { exec: (i, c) => cached.execute(i, c), key: scenario.key, meta };
  }

  // Try existing on storage
  const existingMeta = await storage.getMeta(ref);
  let runtime: DynamicToolRuntime | undefined;
  let meta: ToolMeta | undefined = existingMeta;
  if (existingMeta) {
    runtime = await loadRuntimeFromStorage(ref);
  } else {
    // Generate then load
    const generatedRef = await generateDynamicToolForScenario(scenario, {
      provider: opts.provider,
      model: opts.model,
      storage,
      signal: opts.signal,
    });
    meta = await storage.getMeta(generatedRef);
    if (!meta) throw new Error("tool_meta_not_found_after_generate");
    runtime = await loadRuntimeFromStorage(generatedRef);
  }

  if (!meta || !runtime) throw new Error("tool_load_failed");
  runtimeCache.set(id, runtime);
  const exec: RuntimeExec = async (input, context) => runtime!.execute(input, context);
  return { exec, key: scenario.key, meta };
}
