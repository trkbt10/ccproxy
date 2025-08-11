import type {
  Tool as ClaudeTool,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  Tool as OpenAITool,
  FunctionTool as OpenAIFunctionTool,
} from "openai/resources/responses/responses";
import type {
  ChatCompletionTool,
} from "openai/resources/chat/completions";

/**
 * Convert OpenAI tool definition to Claude tool definition
 */
export function convertOpenAIToolToClaude(tool: OpenAITool): ClaudeTool {
  if (tool.type !== "function") {
    throw new Error(`Unsupported tool type: ${tool.type}`);
  }

  const functionTool = tool as OpenAIFunctionTool;
  
  // Parse JSON schema parameters
  const parameters = functionTool.parameters || {};

  return {
    name: functionTool.name,
    description: functionTool.description || "",
    input_schema: {
      type: "object",
      properties: parameters.properties || {},
      required: Array.isArray(parameters.required) ? parameters.required : [],
    },
  };
}

/**
 * Convert multiple OpenAI tools to Claude tools
 */
export function convertOpenAIToolsToClaude(tools: OpenAITool[]): ClaudeTool[] {
  return tools.map(tool => convertOpenAIToolToClaude(tool));
}

/**
 * Convert OpenAI Chat Completion tool definition to Claude tool definition
 */
export function convertChatCompletionToolToClaude(tool: ChatCompletionTool): ClaudeTool {
  if (tool.type !== "function") {
    throw new Error(`Unsupported Chat Completion tool type: ${tool.type}`);
  }

  // Ensure parameters is a valid JSON Schema object
  const parameters = tool.function.parameters || {};
  
  // Create a proper JSON Schema object
  const inputSchema = {
    type: "object" as const,
    properties: {},
    required: [] as string[],
    ...parameters, // Spread to override defaults with actual parameters
  };

  return {
    name: tool.function.name,
    description: tool.function.description || "",
    input_schema: inputSchema,
  };
}