import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { ResponseCreateParams, Tool } from "openai/resources/responses/responses";

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function extractToolNamesFromChat(req: ChatCompletionCreateParams): string[] {
  const names: string[] = [];
  const choice = (req as { tool_choice?: unknown }).tool_choice as ChatCompletionCreateParams["tool_choice"] | undefined;
  if (choice && typeof choice === "object" && (choice as { type?: unknown }).type === "function") {
    const name = (choice as { function?: { name?: unknown } }).function?.name;
    if (typeof name === "string") names.push(name);
  }
  if (Array.isArray(req.tools)) {
    for (const t of req.tools) {
      if (t && typeof t === "object" && (t as { type?: unknown }).type === "function") {
        const fn = (t as { function?: { name?: unknown } }).function?.name;
        if (typeof fn === "string") names.push(fn);
      }
    }
  }
  return unique(names);
}

export function extractToolNamesFromResponses(req: ResponseCreateParams): string[] {
  const names: string[] = [];
  const toolChoice = (req as { tool_choice?: unknown }).tool_choice as ResponseCreateParams["tool_choice"] | undefined;
  if (toolChoice && typeof toolChoice === "object" && (toolChoice as { type?: unknown }).type === "function") {
    const name = (toolChoice as { name?: unknown }).name;
    if (typeof name === "string") names.push(name);
  }
  const tools = (req as { tools?: unknown }).tools as Tool[] | undefined;
  if (Array.isArray(tools)) {
    for (const t of tools) {
      if (t && typeof t === "object" && (t as { type?: unknown }).type === "function") {
        const name = (t as { name?: unknown }).name;
        if (typeof name === "string") names.push(name);
      }
    }
  }
  return unique(names);
}

// Provider selection unified via selectProvider in provider-selection.ts.
