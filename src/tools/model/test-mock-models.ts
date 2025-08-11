/**
 * @file Test Mock Data for Model Grade Detection
 * @description This file contains mock model lists used exclusively for testing the model grade detector.
 * These are NOT actual model lists used in production code.
 * 
 * WARNING: This file should NEVER be imported in production code.
 * It exists solely for testing purposes to verify the grade detection algorithm.
 */

// ============================================
// TEST DATA - NOT FOR PRODUCTION USE
// ============================================

/**
 * Mock Grok model list for testing
 * Used to verify grade detection for Grok family models
 */
export const GROK_MODELS = [
  "grok-2-1212",
  "grok-2-vision-1212",
  "grok-3",
  "grok-3-fast",
  "grok-3-mini",
  "grok-3-mini-fast",
  "grok-4-0709",
  "grok-2-image-1212",
] as const;

/**
 * Mock Gemini model list for testing
 * Used to verify grade detection for Google's Gemini family models
 */
export const GEMINI_MODELS = [
  "embedding-gecko-001",
  "gemini-1.5-pro-latest",
  "gemini-1.5-pro-002",
  "gemini-1.5-pro",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-002",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash-8b-001",
  "gemini-1.5-flash-8b-latest",
  "gemini-2.5-pro-preview-03-25",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-pro",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-2.0-flash-lite-preview",
  "gemini-2.0-pro-exp",
  "gemini-2.0-pro-exp-02-05",
  "gemini-exp-1206",
  "gemini-2.0-flash-thinking-exp-01-21",
  "gemini-2.0-flash-thinking-exp",
  "gemini-2.0-flash-thinking-exp-1219",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
  "learnlm-2.0-flash-experimental",
  "gemma-3-1b-it",
  "gemma-3-4b-it",
  "gemma-3-12b-it",
  "gemma-3-27b-it",
  "gemma-3n-e4b-it",
  "gemma-3n-e2b-it",
  "gemini-2.5-flash-lite",
  "embedding-001",
  "text-embedding-004",
  "gemini-embedding-exp-03-07",
  "gemini-embedding-exp",
  "gemini-embedding-001",
  "aqa",
  "imagen-3.0-generate-002",
  "imagen-4.0-generate-preview-06-06",
] as const;

/**
 * Mock Groq model list for testing
 * Used to verify grade detection for Groq-hosted models
 */
export const GROQ_MODELS = [
  "whisper-large-v3-turbo",
  "qwen/qwen3-32b",
  "moonshotai/kimi-k2-instruct",
  "gemma2-9b-it",
  "llama3-8b-8192",
  "whisper-large-v3",
  "deepseek-r1-distill-llama-70b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "llama3-70b-8192",
  "openai/gpt-oss-120b",
  "allam-2-7b",
  "distil-whisper-large-v3-en",
  "compound-beta",
  "compound-beta-mini",
  "playai-tts",
  "meta-llama/llama-prompt-guard-2-22m",
  "playai-tts-arabic",
  "meta-llama/llama-prompt-guard-2-86m",
  "meta-llama/llama-guard-4-12b",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
] as const;

/**
 * Mock OpenAI model list for testing
 * Used to verify grade detection for OpenAI models
 */
export const OPENAI_MODELS = [
  "gpt-4-0613",
  "gpt-4",
  "gpt-3.5-turbo",
  "gpt-5-nano",
  "gpt-5",
  "gpt-5-mini-2025-08-07",
  "gpt-5-mini",
  "gpt-5-nano-2025-08-07",
  "davinci-002",
  "babbage-002",
  "gpt-3.5-turbo-instruct",
  "gpt-3.5-turbo-instruct-0914",
  "dall-e-3",
  "dall-e-2",
  "gpt-4-1106-preview",
  "gpt-3.5-turbo-1106",
  "tts-1-hd",
  "tts-1-1106",
  "tts-1-hd-1106",
  "text-embedding-3-small",
  "text-embedding-3-large",
  "gpt-4-0125-preview",
  "gpt-4-turbo-preview",
  "gpt-3.5-turbo-0125",
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4o",
  "gpt-4o-2024-05-13",
  "gpt-4o-mini-2024-07-18",
  "gpt-4o-mini",
  "gpt-4o-2024-08-06",
  "chatgpt-4o-latest",
  "o1-mini-2024-09-12",
  "o1-mini",
  "gpt-4o-realtime-preview-2024-10-01",
  "gpt-4o-audio-preview-2024-10-01",
  "gpt-4o-audio-preview",
  "gpt-4o-realtime-preview",
  "omni-moderation-latest",
  "omni-moderation-2024-09-26",
  "gpt-4o-realtime-preview-2024-12-17",
  "gpt-4o-audio-preview-2024-12-17",
  "gpt-4o-mini-realtime-preview-2024-12-17",
  "gpt-4o-mini-audio-preview-2024-12-17",
  "o1-2024-12-17",
  "o1",
  "gpt-4o-mini-realtime-preview",
  "gpt-4o-mini-audio-preview",
  "computer-use-preview",
  "o3-mini",
  "o3-mini-2025-01-31",
  "gpt-4o-2024-11-20",
  "computer-use-preview-2025-03-11",
  "gpt-4o-search-preview-2025-03-11",
  "gpt-4o-search-preview",
  "gpt-4o-mini-search-preview-2025-03-11",
  "gpt-4o-mini-search-preview",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "o1-pro-2025-03-19",
  "o1-pro",
  "gpt-4o-mini-tts",
  "o3-2025-04-16",
  "o4-mini-2025-04-16",
  "o3",
  "o4-mini",
  "gpt-4.1-2025-04-14",
  "gpt-4.1",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-mini",
  "gpt-4.1-nano-2025-04-14",
  "gpt-4.1-nano",
  "gpt-image-1",
  "codex-mini-latest",
  "o3-pro",
  "gpt-4o-realtime-preview-2025-06-03",
  "gpt-4o-audio-preview-2025-06-03",
  "o3-pro-2025-06-10",
  "o4-mini-deep-research",
  "o3-deep-research",
  "o3-deep-research-2025-06-26",
  "o4-mini-deep-research-2025-06-26",
  "gpt-5-chat-latest",
  "gpt-5-2025-08-07",
  "gpt-3.5-turbo-16k",
  "tts-1",
  "whisper-1",
  "text-embedding-ada-002",
] as const;

// ============================================
// TYPE DEFINITIONS FOR TEST PURPOSES ONLY
// ============================================

export type GrokModel = (typeof GROK_MODELS)[number];
export type GeminiModel = (typeof GEMINI_MODELS)[number];
export type GroqModel = (typeof GROQ_MODELS)[number];
export type OpenAIModel = (typeof OPENAI_MODELS)[number];

/**
 * Union type of all mock models
 * This type is used in tests to ensure the grade detector
 * can handle various model naming patterns
 */
export type AllModels = GrokModel | GeminiModel | GroqModel | OpenAIModel;

// ============================================
// TEST NOTICE
// ============================================
// This file is part of the test suite.
// DO NOT import this file in production code.
// The model lists here are synthetic test data
// designed to verify the robustness of the
// model grade detection algorithm.