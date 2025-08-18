/**
 * @fileoverview Converts Chat Completions API parameters to Responses API format
 * 
 * Why: Provides translation layer between OpenAI Chat Completions API parameters
 * and Responses API parameters to enable compatibility between different API styles.
 */

import type {
  ChatCompletionCreateParams,
  ChatCompletionContentPart,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  ResponseCreateParams,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses";
import {
  isOpenAIChatTextPart,
  isOpenAIChatFunctionTool,
  isOpenAIChatFunctionToolChoice,
  isOpenAIChatBasicRole,
} from "../guards";
import { isObject } from "../../shared/type-guards";

/**
 * Extract text content from various chat message content formats
 */
export function extractTextFromContent(
  content: ChatCompletionCreateParams["messages"][number]["content"]
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = (content as ChatCompletionContentPart[])
      .map((p) => (isOpenAIChatTextPart(p) ? p.text : ""))
      .filter(Boolean);
    return texts.join("");
  }
  return "";
}

/**
 * Convert chat tools array to responses tools format
 */
export function mapChatToolsToResponses(
  tools: ChatCompletionCreateParams["tools"] | undefined
): Tool[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: Tool[] = [];
  for (const t of tools) {
    if (isOpenAIChatFunctionTool(t)) {
      const raw = (t.function as { parameters?: unknown }).parameters;
      const params: Record<string, unknown> | null =
        isObject(raw) ? (raw as Record<string, unknown>) : null;
      const tool: Tool = {
        type: "function",
        name: t.function.name,
        description:
          typeof t.function.description === "string"
            ? t.function.description
            : undefined,
        parameters: params,
        strict: false,
      };
      out.push(tool);
    }
  }
  return out.length ? out : undefined;
}

/**
 * Convert a single chat tool to responses tool format
 */
export function convertOpenAIChatToolToResponsesTool(
  chatTool: ChatCompletionTool
): Tool | null {
  if (!isOpenAIChatFunctionTool(chatTool)) return null;
  const raw = (chatTool.function as { parameters?: unknown }).parameters;
  const params: Record<string, unknown> | null =
    isObject(raw) ? (raw as Record<string, unknown>) : null;
  return {
    type: "function",
    name: chatTool.function.name,
    description:
      typeof chatTool.function.description === "string"
        ? chatTool.function.description
        : undefined,
    parameters: params,
    strict: false,
  };
}

/**
 * Convert chat tool choice to responses tool choice format
 */
export function mapChatToolChoiceToResponses(
  tc: ChatCompletionCreateParams["tool_choice"] | undefined
): ResponseCreateParams["tool_choice"] | undefined {
  if (!tc) return undefined;
  if (tc === "auto" || tc === "none" || tc === "required") return tc;
  // Reuse provider-specific guard; additionally ensure function.name is a string
  if (isOpenAIChatFunctionToolChoice(tc) && isObject((tc as { function?: unknown }).function)) {
    const name = (tc as { function: { name?: unknown } }).function.name;
    if (typeof name === "string") return { type: "function", name };
  }
  return undefined;
}

/**
 * Build response input items from chat messages
 */
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
    if (isOpenAIChatBasicRole(m.role)) {
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