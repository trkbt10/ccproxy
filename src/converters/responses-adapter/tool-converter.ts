import type { 
  Tool,
  FunctionTool,
  FileSearchTool,
  WebSearchTool,
  ComputerTool,
  ToolChoiceOptions,
  ToolChoiceTypes,
  ToolChoiceFunction
} from "openai/resources/responses/responses";
import type { 
  ChatCompletionTool,
  ChatCompletionToolChoiceOption 
} from "openai/resources/chat/completions";

/**
 * Converts Responses API tools to Chat Completion tools
 */
export const convertToolsForChat = (tools: Tool[]): ChatCompletionTool[] => {
  const chatTools: ChatCompletionTool[] = [];
  
  for (const tool of tools) {
    if (isFunctionTool(tool)) {
      chatTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.parameters ?? {},
          strict: tool.strict ?? false
        }
      });
    }
    // Other tool types (FileSearchTool, WebSearchTool, etc.) 
    // are not directly supported in Chat Completions API
    // They would need special handling or emulation
  }
  
  return chatTools;
};

/**
 * Converts Responses API tool choice to Chat Completion tool choice
 */
export const convertToolChoiceForChat = (
  toolChoice: ToolChoiceOptions | ToolChoiceTypes | ToolChoiceFunction
): ChatCompletionToolChoiceOption => {
  // Handle string types
  if (typeof toolChoice === "string") {
    if (toolChoice === "auto" || toolChoice === "none") {
      return toolChoice;
    }
    if (toolChoice === "required") {
      return "required";
    }
    // Handle ToolChoiceTypes enum values
    return "auto"; // Default fallback
  }
  
  // Handle ToolChoiceFunction
  if (isToolChoiceFunction(toolChoice)) {
    return {
      type: "function",
      function: {
        name: toolChoice.name
      }
    };
  }
  
  // Handle ToolChoiceOptions
  if (isToolChoiceOptions(toolChoice)) {
    // ToolChoiceOptions doesn't have type "function" in Responses API
    // It's a different structure, so we return auto as default
    return "auto";
  }
  
  return "auto"; // Default fallback
};

// Type guards
const isFunctionTool = (tool: Tool): tool is FunctionTool => {
  return tool.type === "function";
};

const isToolChoiceFunction = (choice: any): choice is ToolChoiceFunction => {
  return choice &&
    typeof choice === "object" &&
    choice.type === "function" &&
    "name" in choice;
};

const isToolChoiceOptions = (choice: any): choice is ToolChoiceOptions => {
  // ToolChoiceOptions is just a string type
  return typeof choice === "string";
};