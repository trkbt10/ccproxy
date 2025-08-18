import type {
  Responses as OpenAIResponsesNS,
} from "openai/resources/responses/responses";
import type { ChatCompletionToolChoiceOption } from "openai/resources/chat/completions";
import { isOpenAIResponsesFunctionTool } from "../openai-generic/responses/guards";
import { isOpenAIChatFunctionToolChoice } from "../openai-generic/chat/guards";

export type GrokFunction = { name: string; arguments?: string };
export type GrokToolCall = { id?: string; type: "function"; function: GrokFunction };
export type GrokMessage = { role: string; content?: string; tool_calls?: GrokToolCall[] };
export type GrokChoice = {
  message?: GrokMessage;
  delta?: { content?: string; tool_calls?: GrokToolCall[] };
  finish_reason?: string;
};
export type GrokChatCompletion = {
  id?: string;
  choices?: GrokChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type GrokChatMessage = { role: string; content: string | null };
export type GrokFunctionTool = { type: "function"; function: { name: string; description?: string; parameters?: unknown } };
export type GrokToolChoice = { type: "function"; function: { name: string } } | "required";

export function isGrokChatCompletion(v: unknown): v is GrokChatCompletion {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const choices = o["choices"];
  if (!Array.isArray(choices)) return false;
  const c0 = choices[0] as unknown;
  if (typeof c0 !== "object" || c0 === null) return false;
  return true;
}

export async function* ensureGrokStream(
  src: AsyncIterable<unknown>
): AsyncGenerator<GrokChatCompletion, void, unknown> {
  for await (const it of src) {
    if (isGrokChatCompletion(it)) {
      yield it;
    } else {
      throw new TypeError(
        "Stream chunk is not a GrokChatCompletion shape"
      );
    }
  }
}

// General type guards
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// OpenAI-specific type guards
export function isEasyInputMessage(v: unknown): v is OpenAIResponsesNS.EasyInputMessage {
  return (
    isObject(v) &&
    (v as { type?: unknown }).type === "message" &&
    typeof (v as { role?: unknown }).role === "string" &&
    "content" in v
  );
}

export function isResponseInputMessageItem(v: unknown): v is OpenAIResponsesNS.ResponseInputItem.Message {
  return (
    isObject(v) &&
    (v as { type?: unknown }).type === "message" &&
    typeof (v as { role?: unknown }).role === "string" &&
    "content" in v
  );
}

// Backward-compat exports for OpenAI tool guards (delegate to openai-generic)
export const isFunctionTool = isOpenAIResponsesFunctionTool;
export const isFunctionToolChoice = isOpenAIChatFunctionToolChoice as (
  tc: unknown
) => tc is Extract<ChatCompletionToolChoiceOption, { type: "function" }>;
