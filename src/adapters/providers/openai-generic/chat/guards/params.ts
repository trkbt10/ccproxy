/**
 * @fileoverview Type guards for ChatCompletionCreateParams
 * 
 * Why: Provides runtime type checks to safely distinguish between streaming
 * and non-streaming chat completion parameters.
 */

import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";

/**
 * Type guard to check if params are for streaming
 */
export function isChatParamsStreaming(
  params: ChatCompletionCreateParams
): params is ChatCompletionCreateParamsStreaming {
  return params.stream === true;
}

/**
 * Type guard to check if params are for non-streaming
 */
export function isChatParamsNonStreaming(
  params: ChatCompletionCreateParams
): params is ChatCompletionCreateParamsNonStreaming {
  return params.stream !== true;
}