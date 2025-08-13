import type { DynamicToolContext, ToolRef } from "../types";
import { loadRuntimeFromStorage } from "./loader";

export async function executeGeneratedTool(ref: ToolRef, input: unknown, context: DynamicToolContext): Promise<unknown> {
  const runtime = await loadRuntimeFromStorage(ref);
  return await runtime.execute(input, context);
}
