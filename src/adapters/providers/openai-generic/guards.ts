import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Tool as ResponsesTool, FunctionTool as ResponsesFunctionTool } from "openai/resources/responses/responses";
import type {
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionFunctionTool,
} from "openai/resources/chat/completions";

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isResponseEventStream(
  v: unknown
): v is AsyncIterable<ResponseStreamEvent> {
  return isObject(v) && Symbol.asyncIterator in v;
}

export function isResponseStreamEvent(v: unknown): v is ResponseStreamEvent {
  return isObject(v) && typeof (v as { type?: unknown }).type === "string";
}

export async function* ensureOpenAIResponseStream(
  src: AsyncIterable<unknown>
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  for await (const it of src) {
    if (isResponseStreamEvent(it)) {
      yield it;
    } else {
      throw new TypeError("Stream chunk is not a valid ResponseStreamEvent");
    }
  }
}

export function isOpenAIResponse(v: unknown): v is OpenAIResponse {
  return isObject(v) && (v as { object?: unknown }).object === "response";
}

export function responseHasFunctionCall(resp: OpenAIResponse): boolean {
  const out = (resp as { output?: unknown }).output;
  if (!Array.isArray(out)) return false;
  return out.some(
    (i) => isObject(i) && (i as { type?: unknown }).type === "function_call"
  );
}

// Chat (OpenAI) specific guards aggregated here for openai-generic context

export function isOpenAIChatTextPart(
  part: unknown
): part is ChatCompletionContentPartText {
  return (
    isObject(part) &&
    (part as { type?: unknown }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

export function isOpenAIChatFunctionTool(
  t: ChatCompletionTool
): t is ChatCompletionFunctionTool {
  return (
    isObject(t) &&
    (t as { type?: unknown }).type === "function" &&
    isObject((t as { function?: unknown }).function) &&
    typeof ((t as { function: { name?: unknown } }).function.name) === "string"
  );
}

export function isOpenAIChatFunctionToolChoice(
  tc: unknown
): tc is Extract<ChatCompletionToolChoiceOption, { type: "function" }> {
  return (
    isObject(tc) &&
    (tc as { type?: unknown }).type === "function" &&
    isObject((tc as { function?: unknown }).function) &&
    typeof ((tc as { function: { name?: unknown } }).function.name) === "string"
  );
}

export function isOpenAIChatBasicRole(role: unknown): role is "user" | "assistant" | "system" {
  return role === "user" || role === "assistant" || role === "system";
}

// Responses (OpenAI) specific guards
export function isOpenAIResponsesFunctionTool(
  tool: ResponsesTool
): tool is ResponsesFunctionTool {
  return tool.type === "function";
}
