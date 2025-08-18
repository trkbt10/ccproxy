/**
 * @fileoverview Converts ChatCompletionCreateParams to ResponseCreateParams
 * 
 * Why: Provides type-safe conversion from Chat Completions API parameters
 * to Responses API parameters for fallback scenarios in the adapter factory.
 */

import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type {
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";
import {
  buildResponseInputFromChatMessages,
  mapChatToolsToResponses,
  mapChatToolChoiceToResponses,
} from "./converter";

/**
 * Convert ChatCompletionCreateParams to ResponseCreateParams
 */
export function convertChatParamsToResponseParams(
  params: ChatCompletionCreateParamsNonStreaming
): ResponseCreateParamsNonStreaming;
export function convertChatParamsToResponseParams(
  params: ChatCompletionCreateParamsStreaming
): ResponseCreateParamsStreaming;
export function convertChatParamsToResponseParams(
  params: ChatCompletionCreateParams
): ResponseCreateParams {
  // Build response input from chat messages
  const input = buildResponseInputFromChatMessages(params.messages);

  // Base response params
  const responseParams: ResponseCreateParams = {
    model: params.model,
    stream: params.stream ?? false,
    input,
  };

  // Optional parameters
  if (params.tools !== undefined) {
    const tools = mapChatToolsToResponses(params.tools);
    if (tools) {
      responseParams.tools = tools;
    }
  }

  if (params.tool_choice !== undefined) {
    const toolChoice = mapChatToolChoiceToResponses(params.tool_choice);
    if (toolChoice) {
      responseParams.tool_choice = toolChoice;
    }
  }

  // Copy over common optional parameters
  if (params.temperature !== undefined) {
    responseParams.temperature = params.temperature;
  }

  if (params.top_p !== undefined) {
    responseParams.top_p = params.top_p;
  }

  if (params.max_tokens !== undefined) {
    responseParams.max_output_tokens = params.max_tokens;
  }

  // Note: 'stop' parameter exists in ChatCompletion but not in Responses API
  // It would need to be handled differently or omitted

  if (params.metadata !== undefined) {
    responseParams.metadata = params.metadata;
  }

  return responseParams as any; // Type assertion needed due to conditional types
}