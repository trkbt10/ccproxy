/**
 * @fileoverview Type guards specific to OpenAI Chat Completions API
 * 
 * Why: Provides type-safe runtime checks for Chat Completions API structures
 * to ensure data integrity when processing chat-related requests and responses.
 */

import type {
  ChatCompletionContentPartText,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionFunctionTool,
} from "openai/resources/chat/completions";
import { isObject } from "../shared/type-guards";

/**
 * Check if a content part is a text part
 */
export function isOpenAIChatTextPart(
  part: unknown
): part is ChatCompletionContentPartText {
  return (
    isObject(part) &&
    (part as { type?: unknown }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

/**
 * Check if a tool is a function tool
 */
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

/**
 * Check if a tool choice is a function tool choice
 */
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

/**
 * Check if a role is a basic chat role
 */
export function isOpenAIChatBasicRole(role: unknown): role is "user" | "assistant" | "system" {
  return role === "user" || role === "assistant" || role === "system";
}

