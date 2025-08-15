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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isTextPart(part: ChatCompletionContentPart): part is ChatCompletionContentPartText {
  return (
    isObject(part) &&
    (part as { type?: unknown }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

export function extractTextFromContent(
  content: ChatCompletionCreateParams["messages"][number]["content"]
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = (content as ChatCompletionContentPart[])
      .map((p) => (isTextPart(p) ? p.text : ""))
      .filter(Boolean);
    return texts.join("");
  }
  return "";
}

export function isFunctionTool(
  t: ChatCompletionTool
): t is ChatCompletionTool & {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
} {
  return (
    isObject(t) &&
    (t as { type?: unknown }).type === "function" &&
    isObject((t as { function?: unknown }).function) &&
    typeof ((t as { function: { name?: unknown } }).function.name) === "string"
  );
}

export function mapChatToolsToResponses(
  tools: ChatCompletionCreateParams["tools"] | undefined
): Tool[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: Tool[] = [];
  for (const t of tools) {
    if (isFunctionTool(t)) {
      const params = ((): Record<string, unknown> | null => {
        const p = (t.function as { parameters?: unknown }).parameters;
        return typeof p === "object" && p !== null
          ? (p as Record<string, unknown>)
          : null;
      })();
      const tool: Tool = {
        type: "function",
        name: t.function.name,
        description:
          typeof t.function.description === "string"
            ? t.function.description
            : undefined,
        parameters: params ?? undefined,
        strict: false,
      };
      out.push(tool);
    }
  }
  return out.length ? out : undefined;
}

function isFunctionToolChoice(
  v: unknown
): v is { type: "function"; function: { name: string } } {
  return (
    isObject(v) &&
    (v as { type?: unknown }).type === "function" &&
    isObject((v as { function?: unknown }).function) &&
    typeof ((v as { function: { name?: unknown } }).function.name) === "string"
  );
}

export function mapChatToolChoiceToResponses(
  tc: ChatCompletionCreateParams["tool_choice"] | undefined
): ResponseCreateParams["tool_choice"] | undefined {
  if (!tc) return undefined;
  if (tc === "auto" || tc === "none" || tc === "required") return tc;
  if (isFunctionToolChoice(tc)) {
    return { type: "function", name: tc.function.name };
  }
  return undefined;
}

export function buildResponseInputFromChatMessages(
  messages: ChatCompletionCreateParams["messages"] | undefined
): ResponseInputItem[] {
  const src = Array.isArray(messages) ? messages : [];
  const out: ResponseInputItem[] = [];
  for (const m of src) {
    const text = extractTextFromContent(m.content);
    const parts: Array<{ type: "input_text"; text: string }> = text
      ? [{ type: "input_text", text }]
      : [];
    if (isBasicRole(m.role)) {
      const item: ResponseInputItem = {
        type: "message",
        role: m.role,
        content: parts,
      };
      out.push(item);
    }
  }
  return out;
}

function isBasicRole(role: unknown): role is "user" | "assistant" | "system" {
  return role === "user" || role === "assistant" || role === "system";
}
