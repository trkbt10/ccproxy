/**
 * Type guards for Harmony harmonizer
 */

import type { 
  Tool,
  FunctionTool,
  FileSearchTool,
  WebSearchTool,
  ComputerTool,
  CustomTool,
  ResponseInputItem,
  ResponseTextConfig,
  ToolChoice,
  ToolChoiceAllowed,
  ToolChoiceFunction,
  ToolChoiceCustom,
  ResponseCreateParamsBase
} from '../types';

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// Parameter validation type guards
export function isValidResponseCreateParams(v: unknown): v is ResponseCreateParamsBase {
  return isObject(v);
}

export function hasValidModel(params: unknown): params is { model: string } {
  return isObject(params) && 
    'model' in params && 
    typeof params.model === 'string';
}

export function hasValidInput(params: unknown): params is { input: string | ResponseInputItem[] } {
  return isObject(params) && 
    'input' in params && 
    (typeof params.input === 'string' || Array.isArray(params.input));
}

export function hasValidInstructions(params: unknown): params is { instructions: string | null } {
  return isObject(params) && 
    'instructions' in params && 
    (params.instructions === null || typeof params.instructions === 'string');
}

export function hasValidTemperature(params: unknown): params is { temperature: number | null } {
  return isObject(params) && 
    'temperature' in params && 
    (params.temperature === null || 
      (typeof params.temperature === 'number' && 
       params.temperature >= 0 && 
       params.temperature <= 2));
}

export function hasValidTopP(params: unknown): params is { top_p: number | null } {
  return isObject(params) && 
    'top_p' in params && 
    (params.top_p === null || 
      (typeof params.top_p === 'number' && 
       params.top_p >= 0 && 
       params.top_p <= 1));
}

export function hasValidMaxOutputTokens(params: unknown): params is { max_output_tokens: number | null } {
  return isObject(params) && 
    'max_output_tokens' in params && 
    (params.max_output_tokens === null || 
      (typeof params.max_output_tokens === 'number' && 
       params.max_output_tokens > 0));
}

export function hasValidReasoning(params: unknown): params is { reasoning: { effort?: string | null } | null } {
  if (!isObject(params) || !('reasoning' in params)) return false;
  const reasoning = params.reasoning;
  return reasoning === null || 
    (isObject(reasoning) && 
     (!('effort' in reasoning) || 
      reasoning.effort === null || 
      typeof reasoning.effort === 'string'));
}

export function hasValidTools(params: unknown): params is { tools: Tool[] } {
  return isObject(params) && 
    'tools' in params && 
    Array.isArray(params.tools) &&
    params.tools.every(tool => isObject(tool));
}

// Tool type guards
export function isFunctionTool(tool: Tool): tool is FunctionTool {
  return isObject(tool) && 'type' in tool && tool.type === 'function';
}

export function isFileSearchTool(tool: Tool): tool is FileSearchTool {
  return isObject(tool) && 'type' in tool && tool.type === 'file_search';
}

export function isWebSearchTool(tool: Tool): tool is WebSearchTool {
  return isObject(tool) && 'type' in tool && (tool.type === 'web_search_preview' || tool.type === 'web_search_preview_2025_03_11');
}

export function isComputerTool(tool: Tool): tool is ComputerTool {
  return isObject(tool) && 'type' in tool && tool.type === 'computer_use_preview';
}

export function isCustomTool(tool: Tool): tool is CustomTool {
  return isObject(tool) && 'type' in tool && tool.type === 'custom';
}

export function isMcpTool(tool: Tool): tool is Tool.Mcp {
  return isObject(tool) && 'type' in tool && tool.type === 'mcp';
}

export function isCodeInterpreterTool(tool: Tool): tool is Tool.CodeInterpreter {
  return isObject(tool) && 'type' in tool && tool.type === 'code_interpreter';
}

export function isBuiltinTool(tool: Tool): boolean {
  if (!isObject(tool) || !('type' in tool)) return false;
  const builtinTypes = ['file_search', 'web_search_preview', 'web_search_preview_2025_03_11', 'computer_use_preview', 'code_interpreter', 'image_generation', 'local_shell'];
  return typeof tool.type === 'string' && builtinTypes.includes(tool.type);
}

// Tool choice type guards
export function isToolChoiceOption(tc: unknown): tc is 'none' | 'auto' | 'required' {
  return tc === 'none' || tc === 'auto' || tc === 'required';
}

export function isToolChoiceAllowed(tc: unknown): tc is ToolChoiceAllowed {
  return isObject(tc) && 
    'type' in tc &&
    tc.type === 'allowed_tools' &&
    'mode' in tc && 
    (tc.mode === 'auto' || tc.mode === 'required') &&
    'tools' in tc &&
    Array.isArray(tc.tools);
}

export function isToolChoiceFunction(tc: unknown): tc is ToolChoiceFunction {
  return isObject(tc) && 
    'type' in tc && 
    tc.type === 'function' && 
    'name' in tc &&
    typeof tc.name === 'string';
}

export function isToolChoiceCustom(tc: unknown): tc is ToolChoiceCustom {
  return isObject(tc) && 
    'type' in tc && 
    tc.type === 'custom' &&
    'name' in tc &&
    typeof tc.name === 'string';
}

// Response input type guards
export function isResponseInputMessage(item: ResponseInputItem): boolean {
  return isObject(item) && 
    'type' in item && 
    item.type === 'message' &&
    'role' in item &&
    (item.role === 'user' || item.role === 'system' || item.role === 'developer' || item.role === 'assistant');
}

export function isResponseInputToolCall(item: ResponseInputItem): boolean {
  return isObject(item) && 
    'type' in item && 
    typeof item.type === 'string' &&
    (item.type.endsWith('_call') || item.type.endsWith('_call_output'));
}

// Response format type guards
export function hasResponseFormat(text: unknown): text is ResponseTextConfig & {
  response_format: {
    type: 'json_schema';
    json_schema: {
      name?: string;
      description?: string;
      schema?: unknown;
    };
  };
} {
  return isObject(text) && 
    'response_format' in text && 
    isObject(text.response_format) &&
    'type' in text.response_format &&
    text.response_format.type === 'json_schema' &&
    'json_schema' in text.response_format &&
    isObject(text.response_format.json_schema);
}

// Response input message type guards
export function isMessageInput(item: unknown): item is {
  type: 'message';
  role: 'user' | 'system' | 'developer' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
} {
  return isObject(item) && 
    'type' in item && 
    item.type === 'message' &&
    'role' in item &&
    typeof item.role === 'string' &&
    ['user', 'system', 'developer', 'assistant'].includes(item.role) &&
    'content' in item &&
    (typeof item.content === 'string' || Array.isArray(item.content));
}

export function isTextInput(item: unknown): item is {
  type: 'input_text';
  text: string;
} {
  return isObject(item) && 
    'type' in item && 
    item.type === 'input_text' &&
    'text' in item &&
    typeof item.text === 'string';
}

export function isContentPart(part: unknown): part is { type: string; text?: string } {
  return isObject(part) && 'type' in part && typeof part.type === 'string';
}

export function isTextContentPart(part: unknown): part is { type: 'text'; text: string } {
  return isContentPart(part) && 
    part.type === 'text' && 
    'text' in part &&
    typeof part.text === 'string';
}

// Tool-related type guards for testing (removed duplicates)

export function isFunctionToolWithName(tool: unknown): tool is FunctionTool {
  return isObject(tool) && 
    'type' in tool &&
    tool.type === 'function' &&
    'name' in tool && 
    typeof tool.name === 'string';
}

