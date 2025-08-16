import type { 
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  ResponseItem
} from "openai/resources/responses/responses";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

export const isMessageOutput = (output: ResponseOutputItem): output is ResponseOutputMessage => {
  return output.type === "message" && "content" in output;
};

export const isFunctionCallOutput = (output: ResponseOutputItem): output is ResponseFunctionToolCall => {
  return output.type === "function_call" && "id" in output && "name" in output;
};

export const isFunctionToolCall = (
  toolCall: ChatCompletionMessageToolCall
): toolCall is ChatCompletionMessageToolCall & { type: "function" } => {
  return toolCall.type === "function";
};

export const hasContent = <T extends { content: unknown }>(
  message: T
): message is T & { content: NonNullable<T["content"]> } => {
  return message.content !== null && message.content !== undefined;
};

export const hasToolCalls = <T extends { tool_calls?: unknown }>(
  message: T
): message is T & { tool_calls: NonNullable<T["tool_calls"]> } => {
  return message.tool_calls !== undefined && message.tool_calls !== null && Array.isArray(message.tool_calls);
};

export const isStreamChunk = (value: unknown): value is AsyncIterable<unknown> => {
  return value !== null && 
    typeof value === "object" && 
    Symbol.asyncIterator in value;
};

export const isResponseItemCompatible = (output: ResponseOutputItem): output is ResponseOutputItem & ResponseItem => {
  // Check if the output item type exists in both ResponseOutputItem and ResponseItem unions
  switch (output.type) {
    case "message":
    case "file_search_call":
    case "computer_call":
    case "web_search_call":
    case "reasoning":
    case "code_interpreter_call":
      return true;
    case "function_call":
      // ResponseFunctionToolCall needs id to be compatible with ResponseFunctionToolCallItem
      return false;
    default:
      // For namespace types like image_generation_call
      return true;
  }
};

