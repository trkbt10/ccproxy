import type { 
  ResponseInput,
  ResponseInputItem,
  EasyInputMessage,
  ResponseInputText,
  ResponseInputImage,
  ResponseInputAudio,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem
} from "openai/resources/responses/responses";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Converts ResponseInput to chat completion messages
 */
export const convertResponseInputToMessages = (
  input: ResponseInput
): ChatCompletionMessageParam[] => {
  const messages: ChatCompletionMessageParam[] = [];
  
  if (Array.isArray(input)) {
    // Handle array of ResponseInputItem
    for (const item of input) {
      const converted = convertInputItem(item);
      if (converted) {
        messages.push(...converted);
      }
    }
  } else if (input && typeof input === "object") {
    // Handle single ResponseInputItem or structured input
    const converted = convertInputItem(input as ResponseInputItem);
    if (converted) {
      messages.push(...converted);
    }
  }
  
  return messages;
};

/**
 * Converts a single ResponseInputItem to chat messages
 */
const convertInputItem = (
  item: ResponseInputItem
): ChatCompletionMessageParam[] => {
  const messages: ChatCompletionMessageParam[] = [];
  
  // Handle EasyInputMessage
  if (isEasyInputMessage(item)) {
    messages.push({
      role: item.role as "user" | "assistant" | "system",
      content: typeof item.content === "string" 
        ? item.content 
        : convertContentList(item.content)
    });
    return messages;
  }
  
  // Handle ResponseOutputMessage (assistant messages from previous turns)
  if (isResponseOutputMessage(item)) {
    const content = item.content.map(c => {
      if ('text' in c) {
        return c.text;
      }
      return "";
    }).join("");
    
    messages.push({
      role: "assistant",
      content
    });
    return messages;
  }
  
  // Handle function tool calls
  if (isFunctionToolCall(item)) {
    // Function calls are typically part of assistant messages
    // We need to handle this specially
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [{
        id: item.call_id,
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments
        }
      }]
    });
    return messages;
  }
  
  // Handle function tool call outputs
  if (isFunctionToolCallOutput(item)) {
    messages.push({
      role: "tool",
      content: item.output,
      tool_call_id: item.call_id
    });
    return messages;
  }
  
  // Handle other item types as needed
  // For now, we'll skip unsupported types
  return messages;
};

/**
 * Converts ResponseInputMessageContentList to chat content
 */
const convertContentList = (
  content: any[]
): string | any[] => {
  const parts: any[] = [];
  
  for (const item of content) {
    if (isInputText(item)) {
      parts.push({
        type: "text",
        text: item.text
      });
    } else if (isInputImage(item)) {
      parts.push({
        type: "image_url",
        image_url: {
          url: item.image_url,
          detail: item.detail ?? "auto"
        }
      });
    }
    // Add more content types as needed
  }
  
  // If all parts are text, return as string
  if (parts.every(p => p.type === "text")) {
    return parts.map(p => p.text).join("");
  }
  
  return parts;
};

// Type guards
const isEasyInputMessage = (item: any): item is EasyInputMessage => {
  return item && 
    typeof item === "object" &&
    "role" in item &&
    "content" in item &&
    (!("type" in item) || item.type === "message");
};

const isResponseOutputMessage = (item: any): item is ResponseOutputMessage => {
  return item &&
    typeof item === "object" &&
    item.type === "message" &&
    "content" in item &&
    Array.isArray(item.content);
};

const isFunctionToolCall = (item: any): item is ResponseFunctionToolCall => {
  return item &&
    typeof item === "object" &&
    item.type === "function_call" &&
    "name" in item &&
    "arguments" in item;
};

const isFunctionToolCallOutput = (item: any): item is ResponseFunctionToolCallOutputItem => {
  return item &&
    typeof item === "object" &&
    item.type === "function_call_output" &&
    "call_id" in item &&
    "output" in item;
};

const isInputText = (item: any): item is ResponseInputText => {
  return item &&
    typeof item === "object" &&
    item.type === "input_text" &&
    "text" in item;
};

const isInputImage = (item: any): item is ResponseInputImage => {
  return item &&
    typeof item === "object" &&
    item.type === "input_image" &&
    "image_url" in item;
};