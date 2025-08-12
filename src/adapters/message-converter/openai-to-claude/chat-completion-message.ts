import type {
  MessageParam as ClaudeMessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartRefusal,
} from "openai/resources/chat/completions";
import { toClaudeToolUseIdFromOpenAI } from "../../../utils/conversation/id-conversion";
import { logDebug } from "../../../utils/logging/migrate-logger";

/**
 * Convert OpenAI Chat Completion messages to Claude messages and extract system prompt
 */
export function convertChatCompletionMessages(
  messages: ChatCompletionMessageParam[],
  _unused?: unknown
): { messages: ClaudeMessageParam[], system?: string } {
  const claudeMessages: ClaudeMessageParam[] = [];
  let systemPrompt: string | undefined;
  
  for (const message of messages) {
    if (message.role === "system") {
      // Extract system message
      const sysMsg = message as ChatCompletionSystemMessageParam;
      const content = typeof sysMsg.content === "string" 
        ? sysMsg.content 
        : sysMsg.content.map(part => part.text).join("\n");
      
      if (systemPrompt) {
        systemPrompt += "\n\n" + content;
      } else {
        systemPrompt = content;
      }
      logDebug("Extracted system message", { length: content.length });
    } else if (message.role === "user") {
      const userMsg = message as ChatCompletionUserMessageParam;
      const content = convertUserMessageContent(userMsg.content);
      if (content.length > 0) {
        claudeMessages.push({ role: "user", content });
      }
    } else if (message.role === "assistant") {
      const assistantMsg = message as ChatCompletionAssistantMessageParam;
      const content = convertAssistantMessageContent(assistantMsg);
      if (content.length > 0) {
        claudeMessages.push({ role: "assistant", content });
      }
    } else if (message.role === "tool") {
      const toolMsg = message as ChatCompletionToolMessageParam;
      const content = convertToolMessageContent(toolMsg);
      claudeMessages.push({ role: "user", content });
    }
  }
  
  return { messages: claudeMessages, system: systemPrompt };
}

/**
 * Convert user message content to Claude format
 */
function convertUserMessageContent(
  content: string | Array<ChatCompletionContentPart>
): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = [];
  
  if (typeof content === "string") {
    blocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text") {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        // Image handling would require base64 extraction and conversion
        // For now, we'll add a placeholder text
        logDebug("Image URL in Chat Completion not yet supported", { url: part.image_url.url });
        blocks.push({ 
          type: "text", 
          text: "[Image content not supported in this conversion]" 
        });
      } else if (part.type === "input_audio") {
        // Audio is not supported in Claude
        logDebug("Input audio in Chat Completion not yet supported");
        blocks.push({ 
          type: "text", 
          text: "[Audio content not supported in this conversion]" 
        });
      }
      // Note: part.type === "file" is also possible but not handled yet
    }
  }
  
  return blocks;
}

/**
 * Convert assistant message content to Claude format
 */
function convertAssistantMessageContent(
  message: ChatCompletionAssistantMessageParam
): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = [];
  
  // Add text content if present
  if (message.content) {
    if (typeof message.content === "string") {
      blocks.push({ type: "text", text: message.content });
    } else if (Array.isArray(message.content)) {
      // Assistant messages can have array content with text or refusal
      for (const part of message.content) {
        if (part.type === "text") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "refusal") {
          // Convert refusal to text
          blocks.push({ type: "text", text: `[Refusal: ${part.refusal}]` });
        }
      }
    }
  }
  
  // Handle tool calls
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function") {
        // Map OpenAI tool call ID to Claude tool use ID
        const toolUseId = toClaudeToolUseIdFromOpenAI(toolCall.id);
        
        blocks.push({
          type: "tool_use",
          id: toolUseId,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
        
        logDebug("Converted tool call", {
          openaiId: toolCall.id,
          claudeId: toolUseId,
          name: toolCall.function.name,
        });
      }
    }
  }
  
  return blocks;
}

/**
 * Convert tool message to Claude format
 */
function convertToolMessageContent(
  message: ChatCompletionToolMessageParam
): Array<ContentBlockParam | ToolResultBlockParam> {
  // Get the Claude tool use ID from the OpenAI tool call ID
  const claudeId = toClaudeToolUseIdFromOpenAI(message.tool_call_id);
  
  const toolResult: ToolResultBlockParam = {
    type: "tool_result",
    tool_use_id: claudeId,
    content: message.content,
  };
  
  return [toolResult];
}
