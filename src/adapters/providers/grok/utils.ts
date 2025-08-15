import type { Responses as OpenAIResponsesNS } from "openai/resources/responses/responses";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isObject, isEasyInputMessage, isResponseInputMessageItem } from "./guards";
import { isOpenAIResponsesFunctionTool } from "../openai-generic/guards";
import type { GrokChatMessage, GrokFunctionTool, GrokToolChoice } from "./guards";

export function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (!isObject(p)) return "";
        const t = (p as { type?: unknown }).type;
        if (t === "input_text" && typeof (p as { text?: unknown }).text === "string") {
          return String((p as { text?: unknown }).text);
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("");
  }
  return "";
}

export function normalizeInputItems(input: unknown): unknown[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input, type: "message" } satisfies OpenAIResponsesNS.EasyInputMessage];
  }
  if (Array.isArray(input)) return input as unknown[];
  return [];
}

export function mapTools(tools: unknown): GrokFunctionTool[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: GrokFunctionTool[] = [];
  for (const t of tools) {
    if (isOpenAIResponsesFunctionTool(t)) {
      out.push({
        type: "function",
        function: {
          name: (t as { name: string }).name,
          description: (t as { description?: string }).description,
          parameters: (t as { parameters?: unknown }).parameters ?? { type: "object", properties: {} },
        },
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

export function mapToolChoice(tc: unknown): GrokToolChoice | undefined {
  if (tc === "required") return "required";
  if (isObject(tc) && (tc as { type?: unknown }).type === "function" && isObject((tc as { function?: unknown }).function)) {
    const name = (tc as { function: { name?: unknown } }).function.name;
    if (typeof name === "string") return { type: "function", function: { name } };
  }
  return undefined;
}

export function textFromMessages(messages: ChatCompletionMessageParam[]): string {
  const u = [...messages].reverse().find((m) => m.role === "user");
  const t = typeof u?.content === "string" ? u.content : "";
  return t || "Hello";
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function* parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<any, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages (separated by double newlines)
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        // Import parseSSELine from shared utils
        const { parseSSELine } = await import("../shared/sse");
        const payload = parseSSELine(raw);
        if (payload) yield payload;
      }
    }
    
    // Process any remaining data
    if (buffer.trim()) {
      const { parseSSELine } = await import("../shared/sse");
      const payload = parseSSELine(buffer.trim());
      if (payload) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}
