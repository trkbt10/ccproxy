import type { ProviderAdapter } from "./adapter";

export type OpenAIModelsList = {
  object: "list";
  data: Array<{ id: string; object: "model" }>;
};

export function hasListModels(
  adapter: ProviderAdapter
): adapter is ProviderAdapter & { listModels: () => Promise<OpenAIModelsList> } {
  return typeof adapter.listModels === "function";
}

export type ToolCallDelta = {
  type: "function";
  function?: { name?: string; arguments?: string };
};

export function isFunctionToolDelta(v: unknown): v is ToolCallDelta {
  return typeof v === "object" && v !== null && (v as { type?: string }).type === "function";
}
