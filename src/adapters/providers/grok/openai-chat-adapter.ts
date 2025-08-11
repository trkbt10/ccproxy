import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { ChatCompletionMessage, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

function textFromMessages(messages: ChatCompletionMessageParam[]): string {
  const u = [...messages].reverse().find((m) => m.role === "user");
  const t = typeof u?.content === "string" ? u.content : "";
  return t || "Hello";
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isFunctionToolChoice(
  tc: ChatCompletionToolChoiceOption | undefined
): tc is Extract<ChatCompletionToolChoiceOption, { type: "function" }> {
  return isObject(tc) && ("type" in tc) && (tc as { type?: unknown }).type === "function";
}

export function grokToChatCompletion(params: ChatCompletionCreateParams): ChatCompletion {
  const rid = id("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const choice = params.tool_choice;
  const forced = isFunctionToolChoice(choice);
  const name = forced ? choice.function?.name || "" : "";
  const content = `Grok: ${textFromMessages(params.messages)}`;

  const message: ChatCompletionMessage = forced
    ? { role: "assistant", content: null, refusal: null, tool_calls: [{ id: id("call"), type: "function", function: { name, arguments: JSON.stringify({ input: "test" }) } } as ChatCompletionMessageToolCall] }
    : { role: "assistant", content, refusal: null };

  return {
    id: rid,
    object: "chat.completion",
    created,
    model: params.model,
    choices: [{ index: 0, message, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  } as ChatCompletion;
}

export async function* grokToChatCompletionStream(params: ChatCompletionCreateParams): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  const rid = id("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const choice2 = params.tool_choice;
  const forced = isFunctionToolChoice(choice2);
  const name = forced ? choice2.function?.name || "" : "";

  if (forced) {
    const callId = id("call");
    const first: ChatCompletionChunk = {
      id: rid,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [{ index: 0, delta: { role: "assistant", content: null, tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: "" } }] }, finish_reason: null }],
    };
    yield first;
    const second: ChatCompletionChunk = {
      id: rid,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: callId, type: "function", function: { arguments: JSON.stringify({ input: "test" }) } }] }, finish_reason: null }],
    };
    yield second;
    const done: ChatCompletionChunk = { id: rid, object: "chat.completion.chunk", created, model: params.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    yield done;
    return;
  }

  const content = `Grok: ${textFromMessages(params.messages)}`;
  const a = Math.ceil(content.length / 2);
  const parts = [content.slice(0, a), content.slice(a)];
  yield { id: rid, object: "chat.completion.chunk", created, model: params.model, choices: [{ index: 0, delta: { role: "assistant", content: parts[0] }, finish_reason: null }] };
  if (parts[1]) {
    yield { id: rid, object: "chat.completion.chunk", created, model: params.model, choices: [{ index: 0, delta: { content: parts[1] }, finish_reason: null }] };
  }
  yield { id: rid, object: "chat.completion.chunk", created, model: params.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
}
