import type {
  ChatCompletionCreateParams,
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  ResponseCreateParams,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses";
import { isOpenAIResponse, isResponseEventStream } from "../openai-generic/guards";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isTextPart(part: ChatCompletionContentPart): part is ChatCompletionContentPartText {
  return isObject(part) && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string";
}

export function extractTextFromContent(content: ChatCompletionCreateParams["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = (content as ChatCompletionContentPart[]).map((p) => (isTextPart(p) ? p.text : "")).filter(Boolean);
    return texts.join("");
  }
  return "";
}

export function isFunctionTool(t: ChatCompletionTool): t is ChatCompletionTool & { type: "function"; function: { name: string; description?: string; parameters?: unknown } } {
  return (
    isObject(t) &&
    (t as { type?: unknown }).type === "function" &&
    isObject((t as { function?: unknown }).function) &&
    typeof ((t as { function: { name?: unknown } }).function.name) === "string"
  );
}

export function mapChatToolsToResponses(tools: ChatCompletionCreateParams["tools"] | undefined): Tool[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: Tool[] = [];
  for (const t of tools) {
    if (isFunctionTool(t)) {
      const params = ((): Record<string, unknown> | null => {
        const p = (t.function as { parameters?: unknown }).parameters;
        return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null;
      })();
      const tool: Tool = {
        type: "function",
        name: t.function.name,
        description: typeof t.function.description === 'string' ? t.function.description : undefined,
        parameters: params,
        strict: false,
      };
      out.push(tool);
    }
  }
  return out.length ? out : undefined;
}

export function mapChatToolChoiceToResponses(tc: ChatCompletionCreateParams["tool_choice"] | undefined): ResponseCreateParams["tool_choice"] | undefined {
  if (!tc) return undefined;
  if (typeof tc === "string") return tc as ResponseCreateParams["tool_choice"];
  if (typeof tc === "object" && tc !== null && (tc as { type?: unknown }).type === "function") {
    const name = (tc as { function?: { name?: unknown } }).function?.name;
    if (typeof name === "string") return { type: "function", name } as ResponseCreateParams["tool_choice"];
  }
  return undefined;
}

export function buildResponseInputFromChatMessages(messages: ChatCompletionCreateParams["messages"] | undefined): ResponseCreateParams["input"] {
  const src = Array.isArray(messages) ? messages : [];
  const out: ResponseInputItem[] = [];
  for (const m of src) {
    const text = extractTextFromContent(m.content);
    const parts: Array<{ type: "input_text"; text: string }> = text ? [{ type: "input_text", text }] : [];
    out.push({ type: "message", role: m.role, content: parts } as unknown as ResponseInputItem);
  }
  return out as ResponseCreateParams["input"];
}

export { isResponseEventStream, isOpenAIResponse };
