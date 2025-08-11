import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionCreateParams,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { ChatCompletionMessage } from "openai/resources/chat/completions";

function buildAssistantText(messages: ChatCompletionMessageParam[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const txt = typeof lastUser?.content === "string" ? lastUser.content : "";
  return txt ? `Echo: ${txt}` : "Echo: (no input)";
}

function buildId(prefix: string): string {
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

export function geminiToChatCompletion(params: ChatCompletionCreateParams): ChatCompletion {
  const id = buildId("chatcmpl");
  const text = buildAssistantText(params.messages);
  const created = Math.floor(Date.now() / 1000);

  const toolForced = isFunctionToolChoice(params.tool_choice as any);
  const toolName = toolForced && isObject((params.tool_choice as any).function)
    ? String((params.tool_choice as any).function?.name || "")
    : "";

  const message: ChatCompletionMessage = toolForced
    ? {
        role: "assistant",
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: buildId("call"),
            type: "function",
            function: { name: toolName, arguments: JSON.stringify({ input: "test" }) },
          },
        ],
      }
    : {
        role: "assistant",
        content: text,
        refusal: null,
      };

  return {
    id,
    object: "chat.completion",
    created,
    model: params.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  } as ChatCompletion;
}

export async function* geminiToChatCompletionStream(params: ChatCompletionCreateParams): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  const id = buildId("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const toolForced = isFunctionToolChoice(params.tool_choice as any);
  const toolName = toolForced && isObject((params.tool_choice as any).function)
    ? String((params.tool_choice as any).function?.name || "")
    : "";

  if (toolForced) {
    // Emit tool_call deltas
    const callId = buildId("call");
    const firstDelta: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [{
        index: 0,
        delta: {
          role: "assistant",
          content: null,
          tool_calls: [{ index: 0, id: callId, type: "function", function: { name: toolName, arguments: "" } }],
        },
        finish_reason: null,
      }],
    };
    yield firstDelta;
    const secondDelta: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{ index: 0, id: callId, type: "function", function: { arguments: JSON.stringify({ input: "test" }) } }],
        },
        finish_reason: null,
      }],
    };
    yield secondDelta;
    const finalDelta: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    yield finalDelta;
    return;
  }

  const text = buildAssistantText(params.messages);
  const chunks = [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))];
  // First chunk with role
  const first: ChatCompletionChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model: params.model,
    choices: [{ index: 0, delta: { role: "assistant", content: chunks[0] }, finish_reason: null }],
  };
  yield first;
  // Second chunk
  if (chunks[1]) {
    const second: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [{ index: 0, delta: { content: chunks[1] }, finish_reason: null }],
    };
    yield second;
  }
  // Done
  const done: ChatCompletionChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model: params.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  yield done;
}
