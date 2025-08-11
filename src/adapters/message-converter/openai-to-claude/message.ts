import type {
  MessageParam as ClaudeMessageParam,
  TextBlockParam as ClaudeTextBlock,
  ImageBlockParam as ClaudeImageBlock,
  ToolUseBlockParam as ClaudeToolUseBlock,
  ToolResultBlockParam as ClaudeToolResultBlock,
  ContentBlock as ClaudeContentBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseInputItem as OpenAIResponseInputItem,
  ResponseInputText as OpenAIResponseInputText,
  ResponseInputImage as OpenAIResponseInputImage,
  ResponseFunctionToolCall as OpenAIResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem as OpenAIResponseFunctionToolCallOutputItem,
} from "openai/resources/responses/responses";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { convertOpenAIImageToClaude } from "./image";

/**
 * Convert OpenAI message to Claude message format
 */
export function convertOpenAIMessage(
  message: OpenAIResponseInputItem,
  callIdManager: UnifiedIdManager
): ClaudeMessageParam {

  // Check if it's a message type (EasyInputMessage or ResponseInputItem.Message)
  if ('role' in message && 'content' in message) {
    // Handle simple string content
    if (typeof message.content === "string") {
      return {
        role: message.role as "user" | "assistant",
        content: message.content,
      };
    }
    
    // Handle content array
    if (Array.isArray(message.content)) {
      const claudeContent: (ClaudeTextBlock | ClaudeImageBlock | ClaudeToolUseBlock | ClaudeToolResultBlock)[] = [];

      for (const item of message.content) {
        switch (item.type) {
          case "input_text":
            const textBlock: ClaudeTextBlock = {
              type: "text",
              text: item.text,
            };
            claudeContent.push(textBlock);
            break;

          case "input_image":
            const imageBlock = convertOpenAIImageToClaude(item);
            if (imageBlock) {
              claudeContent.push(imageBlock);
            }
            break;

          default:
            {
              let t = "unknown";
              if (typeof item === "object" && item !== null) {
                const obj = item as unknown as { type?: unknown };
                if (typeof obj.type === "string") t = obj.type;
              }
              console.warn(`[WARN] Unknown content type: ${t}`);
            }
        }
      }

      return {
        role: message.role as "user" | "assistant",
        content: claudeContent,
      };
    }
  }

  // Handle function call
  if ('type' in message && message.type === "function_call") {
    const funcCall = message as OpenAIResponseFunctionToolCall;
    const toolUseId = callIdManager.getClaudeToolUseId(funcCall.call_id) || funcCall.call_id;

    const toolUseBlock: ClaudeToolUseBlock = {
      type: "tool_use",
      id: toolUseId,
      name: funcCall.name,
      input: JSON.parse(funcCall.arguments),
    };

    return {
      role: "assistant",
      content: [toolUseBlock],
    };
  }

  // Handle function call output
  if ('type' in message && message.type === "function_call_output") {
    const funcOutput = message as OpenAIResponseFunctionToolCallOutputItem;
    const toolUseId = callIdManager.getClaudeToolUseId(funcOutput.call_id);
    if (!toolUseId) {
      console.warn(`[WARN] No tool_use_id found for call_id: ${funcOutput.call_id}`);
    }

    const toolResultBlock: ClaudeToolResultBlock = {
      type: "tool_result",
      tool_use_id: toolUseId || funcOutput.call_id, // Fallback to call_id if mapping not found
      content: funcOutput.output,
    };

    return {
      role: "user",
      content: [toolResultBlock],
    };
  }


  // Fallback for unknown message types
  console.warn(`[WARN] Unknown message format:`, message);
  return {
    role: "user",
    content: JSON.stringify(message),
  };
}

/**
 * Convert multiple OpenAI messages to Claude messages
 */
export function convertOpenAIMessages(
  messages: OpenAIResponseInputItem[],
  callIdManager: UnifiedIdManager
): ClaudeMessageParam[] {
  const claudeMessages: ClaudeMessageParam[] = [];
  
  let currentMessage: ClaudeMessageParam | null = null;

  for (const message of messages) {
    const converted = convertOpenAIMessage(message, callIdManager);
    
    // Merge consecutive messages with the same role
    if (currentMessage && currentMessage.role === converted.role) {
      // Merge content
      if (typeof currentMessage.content === "string" && typeof converted.content === "string") {
        currentMessage.content += "\n" + converted.content;
      } else {
        // Convert to array format if needed
        const currentContent = Array.isArray(currentMessage.content) 
          ? currentMessage.content 
          : [{ type: "text", text: currentMessage.content } as ClaudeTextBlock];
        
        const newContent = Array.isArray(converted.content)
          ? converted.content
          : [{ type: "text", text: converted.content } as ClaudeTextBlock];
        
        currentMessage.content = [...currentContent, ...newContent];
      }
    } else {
      // Different role, push current and start new
      if (currentMessage) {
        claudeMessages.push(currentMessage);
      }
      currentMessage = converted;
    }
  }
  
  // Don't forget the last message
  if (currentMessage) {
    claudeMessages.push(currentMessage);
  }
  
  return claudeMessages;
}
