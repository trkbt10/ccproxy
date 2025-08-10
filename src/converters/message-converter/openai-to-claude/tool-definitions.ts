import type {
  Tool as ClaudeTool,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  Tool as OpenAITool,
  FunctionTool as OpenAIFunctionTool,
} from "openai/resources/responses/responses";

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