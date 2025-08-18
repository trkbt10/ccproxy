/**
 * @fileoverview Type guards for ResponseCreateParams
 * 
 * Why: Provides runtime type checks to safely distinguish between streaming
 * and non-streaming response parameters.
 */

import type {
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

/**
 * Type guard to check if params are for streaming
 */
export function isResponseParamsStreaming(
  params: ResponseCreateParams
): params is ResponseCreateParamsStreaming {
  return params.stream === true;
}

/**
 * Type guard to check if params are for non-streaming
 */
export function isResponseParamsNonStreaming(
  params: ResponseCreateParams
): params is ResponseCreateParamsNonStreaming {
  return params.stream !== true;
}