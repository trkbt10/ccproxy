import type { ProviderAdapter } from "./adapter";
import type { GenerateContentResponse } from "./gemini/fetch-client";

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

// ---------- Grok minimal types + guards ----------
export type GrokFunction = { name: string; arguments?: string };
export type GrokToolCall = { id?: string; type: "function"; function: GrokFunction };
export type GrokMessage = { role: string; content?: string; tool_calls?: GrokToolCall[] };
export type GrokChoice = { message?: GrokMessage; delta?: { content?: string; tool_calls?: GrokToolCall[] }; finish_reason?: string };
export type GrokChatCompletion = { id?: string; choices?: GrokChoice[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };

export function isGrokChatCompletion(v: unknown): v is GrokChatCompletion {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const choices = o["choices"];
  if (!Array.isArray(choices)) return false;
  // Basic spot check on first choice shape
  const c0 = choices[0] as unknown;
  if (typeof c0 !== "object" || c0 === null) return false;
  return true;
}

export async function* ensureGrokStream(src: AsyncIterable<unknown>): AsyncGenerator<GrokChatCompletion, void, unknown> {
  for await (const it of src) {
    if (isGrokChatCompletion(it)) {
      yield it;
    } else {
      throw new TypeError("Stream chunk is not a GrokChatCompletion shape");
    }
  }
}

// ---------- Gemini guards ----------
export function isGeminiResponse(v: unknown): v is GenerateContentResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return "candidates" in o || "usageMetadata" in o;
}

export async function* ensureGeminiStream(src: AsyncIterable<unknown>): AsyncGenerator<GenerateContentResponse, void, unknown> {
  for await (const it of src) {
    if (isGeminiResponse(it)) {
      yield it;
    } else {
      throw new TypeError("Stream chunk is not a Gemini GenerateContentResponse shape");
    }
  }
}
