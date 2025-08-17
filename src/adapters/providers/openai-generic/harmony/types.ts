/**
 * Type definitions and imports for Harmony harmonizer
 */

import type { 
  ResponseCreateParamsBase,
  Tool,
  ResponseInput,
  ResponseInputItem,
  ResponseTextConfig,
  FunctionTool,
  FileSearchTool,
  WebSearchTool,
  ComputerTool,
  CustomTool,
  ToolChoiceOptions,
  ToolChoiceAllowed as OpenAIToolChoiceAllowed,
  ToolChoiceFunction as OpenAIToolChoiceFunction,
  ToolChoiceTypes,
  ToolChoiceMcp,
  ToolChoiceCustom as OpenAIToolChoiceCustom
} from 'openai/resources/responses/responses';

import type { Reasoning } from 'openai/resources/shared';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Re-export for convenience
export type {
  ResponseCreateParamsBase,
  Tool,
  ResponseInput,
  ResponseInputItem,
  ResponseTextConfig,
  FunctionTool,
  FileSearchTool,
  WebSearchTool,
  ComputerTool,
  CustomTool,
  Reasoning,
  ChatCompletionMessageParam,
  ToolChoiceOptions,
  ToolChoiceTypes,
  ToolChoiceMcp
};

// Tool choice types - extend OpenAI types
export type ToolChoiceAllowed = OpenAIToolChoiceAllowed;
export type ToolChoiceFunction = OpenAIToolChoiceFunction;
export type ToolChoiceCustom = OpenAIToolChoiceCustom;

export type ToolChoice = 
  | ToolChoiceOptions 
  | ToolChoiceAllowed 
  | ToolChoiceFunction 
  | ToolChoiceCustom
  | ToolChoiceTypes
  | ToolChoiceMcp;

// Import constants
import type { HarmonyChannel as HarmonyChannelType, HarmonyRole as HarmonyRoleType, ReasoningLevel, BuiltinTool } from './constants';

// Harmony-specific types
export interface HarmonySystemConfig {
  reasoning?: ReasoningLevel;
  knowledgeCutoff?: string;
  currentDate?: string;
  hasTools?: boolean;
  builtinTools?: BuiltinTool[];
}

export interface HarmonyDeveloperConfig {
  instructions?: string | null;
  tools?: Tool[];
  responseFormat?: ResponseTextConfig;
  toolChoice?: ToolChoice;
}

export interface HarmonyMessage {
  role: HarmonyRoleType;
  channel?: HarmonyChannelType;
  recipient?: string;
  content: string;
  constrainType?: string;
}

export interface HarmonyToolMessage extends HarmonyMessage {
  role: 'tool';
  toolName: string;
}

// Chat completion params mapping
export interface ExtractedChatParams {
  model?: string;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
  stream?: boolean | null;
  stream_options?: any;
  // Other OpenAI ChatCompletion compatible params
}