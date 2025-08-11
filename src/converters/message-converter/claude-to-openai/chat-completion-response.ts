import type {
  Message as ClaudeMessage,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletion,
  ChatCompletionMessage,
} from "openai/resources/chat/completions";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { logDebug } from "../../../utils/logging/migrate-logger";

/**
 * Convert Claude message response to OpenAI Chat Completion format
 */
export function claudeToChatCompletion(
  claudeMessage: ClaudeMessage,
  requestModel: string,
  callIdManager: UnifiedIdManager
): ChatCompletion {
  // Build the assistant message from Claude response
  const message = buildChatCompletionMessage(claudeMessage, callIdManager);
  
  // Determine finish reason
  const finishReason = mapClaudeStopReason(claudeMessage.stop_reason);
  
  // Build the response
  const completion: ChatCompletion = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestModel,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
      logprobs: null,
    }],
    usage: {
      prompt_tokens: claudeMessage.usage.input_tokens,
      completion_tokens: claudeMessage.usage.output_tokens,
      total_tokens: claudeMessage.usage.input_tokens + claudeMessage.usage.output_tokens,
    },
  };
  
  return completion;
}

/**
 * Build ChatCompletionMessage from Claude response
 */
function buildChatCompletionMessage(
  claudeMessage: ClaudeMessage,
  callIdManager: UnifiedIdManager
): ChatCompletionMessage {
  let content = "";
  const tool_calls: NonNullable<ChatCompletionMessage["tool_calls"]> = [];
  
  // Process Claude content blocks
  for (const block of claudeMessage.content) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use") {
      // Get or create OpenAI call ID for this tool use
      const openaiId = callIdManager.getOrCreateOpenAICallIdForToolUse(
        block.id,
        block.name,
        { source: "chat-completion-response" }
      );
      
      tool_calls.push({
        id: openaiId,
        type: "function" as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
      
      logDebug("Converted tool use to tool call", {
        claudeId: block.id,
        openaiId,
        name: block.name,
      });
    }
  }
  
  // Build the message
  const message: ChatCompletionMessage = {
    role: "assistant",
    content: content || null,
    refusal: null,
  };
  
  // Add tool calls if any
  if (tool_calls.length > 0) {
    message.tool_calls = tool_calls;
  }
  
  return message;
}

/**
 * Map Claude stop reason to OpenAI finish reason
 */
function mapClaudeStopReason(
  stopReason: string | null
): ChatCompletion.Choice["finish_reason"] {
  switch (stopReason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "stop_sequence":
      return "stop";
    default:
      return "stop";
  }
}