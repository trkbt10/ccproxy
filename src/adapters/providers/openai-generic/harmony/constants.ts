/**
 * Harmony format special tokens and constants
 * Based on the gpt-oss harmony specification
 */

/**
 * Special tokens used in Harmony format
 * These tokens follow the format <|type|>
 */
export const HARMONY_TOKENS = {
  START: '<|start|>',
  END: '<|end|>',
  MESSAGE: '<|message|>',
  CHANNEL: '<|channel|>',
  CONSTRAIN: '<|constrain|>',
  RETURN: '<|return|>',
  CALL: '<|call|>'
} as const;

/**
 * Token IDs for special tokens in o200k_harmony encoding
 */
export const HARMONY_TOKEN_IDS = {
  START: 200006,
  END: 200007,
  MESSAGE: 200008,
  CHANNEL: 200005,
  CONSTRAIN: 200003,
  RETURN: 200002,
  CALL: 200012
} as const;

/**
 * Valid channels for assistant messages
 */
export const HARMONY_CHANNELS = {
  ANALYSIS: 'analysis',
  COMMENTARY: 'commentary', 
  FINAL: 'final'
} as const;

/**
 * Valid roles in Harmony format
 */
export const HARMONY_ROLES = {
  SYSTEM: 'system',
  DEVELOPER: 'developer',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool'
} as const;

/**
 * Reasoning effort levels
 */
export const REASONING_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

/**
 * Built-in tool namespaces
 */
export const BUILTIN_TOOLS = {
  BROWSER: 'browser',
  PYTHON: 'python'
} as const;

/**
 * Function tool namespace
 */
export const FUNCTION_NAMESPACE = 'functions';

/**
 * Constraint types for tool calls
 */
export const CONSTRAINT_TYPES = {
  JSON: 'json',
  TEXT: 'text',
  CODE: 'code'
} as const;

export type HarmonyToken = typeof HARMONY_TOKENS[keyof typeof HARMONY_TOKENS];
export type HarmonyChannel = typeof HARMONY_CHANNELS[keyof typeof HARMONY_CHANNELS];
export type HarmonyRole = typeof HARMONY_ROLES[keyof typeof HARMONY_ROLES];
export type ReasoningLevel = typeof REASONING_LEVELS[keyof typeof REASONING_LEVELS];
export type BuiltinTool = typeof BUILTIN_TOOLS[keyof typeof BUILTIN_TOOLS];
export type ConstraintType = typeof CONSTRAINT_TYPES[keyof typeof CONSTRAINT_TYPES];