/**
 * Extract ChatCompletion-compatible parameters from Response API params
 */

import type { ResponseCreateParamsBase, ExtractedChatParams } from '../types';

export function extractChatCompletionParams(params: ResponseCreateParamsBase): ExtractedChatParams {
  const chatParams: ExtractedChatParams = {};

  // Map model
  if (params.model) {
    chatParams.model = params.model;
  }

  // Map temperature
  if (params.temperature !== undefined && params.temperature !== null) {
    chatParams.temperature = params.temperature;
  }

  // Map top_p
  if (params.top_p !== undefined && params.top_p !== null) {
    chatParams.top_p = params.top_p;
  }

  // Map max_output_tokens to max_tokens
  if (params.max_output_tokens !== undefined && params.max_output_tokens !== null) {
    chatParams.max_tokens = params.max_output_tokens;
  }

  // Map stream
  if (params.stream !== undefined && params.stream !== null) {
    chatParams.stream = params.stream;
  }

  // Map stream_options
  if (params.stream_options !== undefined && params.stream_options !== null) {
    chatParams.stream_options = params.stream_options;
  }

  // Note: The following Response API params are NOT directly mappable to ChatCompletion:
  // - background
  // - include
  // - input (handled separately as messages)
  // - instructions (handled in developer message)
  // - previous_response_id
  // - prompt
  // - prompt_cache_key
  // - reasoning (handled in system message)
  // - safety_identifier
  // - service_tier
  // - store
  // - text (handled for structured outputs)
  // - tool_choice (needs transformation)
  // - tools (needs transformation)
  // - truncation
  // - user (deprecated)
  // - metadata
  // - parallel_tool_calls (handled in system message if needed)

  return chatParams;
}