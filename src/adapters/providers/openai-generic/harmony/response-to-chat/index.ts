/**
 * Response to Chat Conversion Module
 * 
 * Exports the main harmonizer function and related types for converting
 * OpenAI Responses API parameters to ChatCompletion messages in Harmony format.
 */

export { harmonizeResponseParams, type HarmonizerOptions } from './harmonizer';

// Re-export useful types
export type { ResponseCreateParamsBase, ChatCompletionMessageParam } from '../types';