/**
 * @fileoverview Test fixtures for Harmony tests
 * 
 * ⚠️ WARNING: This file is intended for TEST FILES ONLY!
 * DO NOT import this file in production code.
 * 
 * This file contains test helpers and fixtures that provide properly typed test data.
 * The fixtures are designed to test edge cases and error conditions that should not
 * occur in production code.
 * 
 * @module fixtures.test.support
 */

import type { 
  Tool, 
  FunctionTool, 
  ResponseInputItem,
  ResponseTextConfig,
  ToolChoice,
  ResponseCreateParamsBase
} from './types';

// Tool fixtures
export const webSearchTool: Tool = {
  type: 'web_search_preview_2025_03_11'
} as Tool;

export const codeInterpreterTool: Tool = {
  type: 'code_interpreter'
} as Tool;

export function createFunctionTool(overrides?: Partial<FunctionTool>): FunctionTool {
  return {
    type: 'function',
    name: 'test_func',
    description: 'Test function',
    parameters: {},
    strict: null,
    ...overrides
  };
}

// Message input fixtures
export function createMessageInput(
  role: 'user' | 'system' | 'developer' | 'assistant',
  content: string | Array<{ type: string; text?: string }>
): ResponseInputItem {
  return {
    type: 'message',
    role,
    content
  } as ResponseInputItem;
}

export function createTextInput(text: string) {
  return {
    type: 'input_text' as const,
    text
  };
}

export function createFunctionCallInput(name: string): ResponseInputItem {
  return {
    type: 'function_call',
    name
  } as ResponseInputItem;
}

export function createFunctionCallOutput(output: string): ResponseInputItem {
  return {
    type: 'function_call_output',
    output
  } as ResponseInputItem;
}

// Response format fixtures
export function createResponseTextConfig(
  name: string,
  schema: any,
  description?: string
): ResponseTextConfig {
  return {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name,
        description,
        schema
      }
    }
  } as ResponseTextConfig;
}

// Tool choice fixtures
export const toolChoiceNone: ToolChoice = 'none';
export const toolChoiceAuto: ToolChoice = 'auto';
export const toolChoiceRequired: ToolChoice = 'required';

export function createToolChoiceFunction(name: string): ToolChoice {
  return {
    type: 'function',
    name
  };
}

export function createToolChoiceCustom(name: string): ToolChoice {
  return {
    type: 'custom',
    name
  };
}

export function createToolChoiceAllowed(mode: 'auto' | 'required', tools?: Array<{ type: string; name?: string }>): ToolChoice {
  return {
    type: 'allowed_tools',
    mode,
    tools: tools || []
  };
}

// Invalid params for testing validation
export function createInvalidParams(overrides: Partial<ResponseCreateParamsBase>): unknown {
  return overrides;
}

// Create invalid function tool for testing
export function createInvalidFunctionTool(func: Record<string, unknown>): unknown {
  return { function: func };
}

// Content parts
export function createTextContentPart(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

export function createImageContentPart(url: string): { type: 'image'; url: string } {
  return { type: 'image', url };
}