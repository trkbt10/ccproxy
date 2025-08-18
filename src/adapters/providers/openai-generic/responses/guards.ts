/**
 * @fileoverview Type guards specific to OpenAI Responses API
 * 
 * Why: Provides type-safe runtime checks for Responses API structures
 * to ensure data integrity when processing response-related requests and streams.
 */

import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
  Tool as ResponsesTool,
  FunctionTool as ResponsesFunctionTool,
} from "openai/resources/responses/responses";
import { isObject } from "../shared/type-guards";

/**
 * Check if a value is a response event stream
 */
export function isResponseEventStream(
  v: unknown
): v is AsyncIterable<ResponseStreamEvent> {
  return isObject(v) && Symbol.asyncIterator in v;
}

/**
 * Check if a value is a response stream event
 */
export function isResponseStreamEvent(v: unknown): v is ResponseStreamEvent {
  return isObject(v) && typeof (v as { type?: unknown }).type === "string";
}

/**
 * Ensure all items in a stream are valid ResponseStreamEvents
 */
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

/**
 * Check if a value is an OpenAI Response
 */
export function isOpenAIResponse(v: unknown): v is OpenAIResponse {
  return isObject(v) && (v as { object?: unknown }).object === "response";
}

/**
 * Check if a response contains a function call
 */
export function responseHasFunctionCall(resp: OpenAIResponse): boolean {
  const out = (resp as { output?: unknown }).output;
  if (!Array.isArray(out)) return false;
  return out.some(
    (i) => isObject(i) && (i as { type?: unknown }).type === "function_call"
  );
}

/**
 * Check if a tool is a function tool
 */
export function isOpenAIResponsesFunctionTool(
  tool: ResponsesTool
): tool is ResponsesFunctionTool {
  return tool.type === "function";
}

