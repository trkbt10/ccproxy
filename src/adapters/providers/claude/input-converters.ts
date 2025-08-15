import type { ResponseInput, Tool, ToolChoiceOptions, ToolChoiceFunction } from "openai/resources/responses/responses";
import { isEasyInputMessage } from "./guards";
import { isOpenAIResponsesFunctionTool } from "../openai-generic/guards";
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionToolChoiceOption } from "openai/resources/chat/completions";
import type { FunctionDefinition } from "openai/resources/shared";

export function convertResponseInputToMessagesLocal(input: ResponseInput): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (typeof input === "string") {
    out.push({ role: "user", content: input });
    return out;
  }
  if (Array.isArray(input)) {
    for (const it of input) {
      if (!it || typeof it !== "object") continue;
      // Easy input style: { role, content }
      if (isEasyInputMessage(it)) {
        const role = it.role;
        const content = it.content;
        out.push({ role, content: normalizeContent(content) });
        continue;
      }
      // We intentionally ignore other item shapes to keep conversion minimal and safe
    }
  }
  return out;
}

function normalizeContent(content: unknown): string | Array<{ type: 'text'; text: string }> {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: Array<{ type: 'text'; text: string }> = [];
    for (const p of content) {
      if (p && typeof p === "object") {
        if ((p as { type?: unknown }).type === "input_text" && typeof (p as { text?: unknown }).text === "string") {
          parts.push({ type: "text", text: (p as { text: string }).text });
        }
      }
    }
    if (parts.length === 0) return "";
    if (parts.every((x) => x.type === "text")) return parts.map((x) => x.text).join("");
    return parts;
  }
  return "";
}

export function convertToolsForChatLocal(tools: Tool[] | undefined): ChatCompletionTool[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const out: ChatCompletionTool[] = [];
  for (const t of tools) {
    if (isOpenAIResponsesFunctionTool(t)) {
      const fn: FunctionDefinition = {
        name: t.name,
        description: t.description ?? "",
      };
      
      // Add parameters if they exist
      if (t.parameters) {
        fn.parameters = t.parameters;
      }
      if (t.strict !== undefined) {
        fn.strict = t.strict;
      }
      
      out.push({ type: "function", function: fn });
    }
  }
  return out.length ? out : undefined;
}

export function convertToolChoiceForChatLocal(toolChoice: unknown): ChatCompletionToolChoiceOption | undefined {
  if (toolChoice == null) return undefined;
  if (typeof toolChoice === "string") {
    if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
    return "auto";
  }
  if (typeof toolChoice === "object" && toolChoice !== null) {
    const obj = toolChoice as Record<string, unknown>;
    if (obj.type === "function" && typeof obj.name === 'string') {
      return { type: "function", function: { name: obj.name } };
    }
  }
  return "auto";
}
