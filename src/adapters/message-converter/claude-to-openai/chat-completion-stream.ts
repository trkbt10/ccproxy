import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { logDebug } from "../../../utils/logging/migrate-logger";

/**
 * Convert Claude streaming event to OpenAI Chat Completion chunk
 */
export function claudeEventToChatCompletionChunk(
  event: MessageStreamEvent,
  requestModel: string,
  callIdManager: UnifiedIdManager
): ChatCompletionChunk | null {
  const chunk: ChatCompletionChunk = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: requestModel,
    choices: [],
  };

  switch (event.type) {
    case "message_start":
      // Initial chunk with role
      chunk.choices.push({
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null,
        logprobs: null,
      });
      return chunk;

    case "content_block_start":
      if (event.content_block.type === "text") {
        // Start of text content
        chunk.choices.push({
          index: event.index,
          delta: { content: "" },
          finish_reason: null,
          logprobs: null,
        });
        return chunk;
      } else if (event.content_block.type === "tool_use") {
        // Start of tool use
        const openaiId = callIdManager.getOrCreateOpenAICallIdForToolUse(
          event.content_block.id,
          event.content_block.name,
          { source: "chat-completion-stream" }
        );
        
        chunk.choices.push({
          index: event.index,
          delta: {
            tool_calls: [{
              index: 0,
              id: openaiId,
              type: "function",
              function: {
                name: event.content_block.name,
                arguments: "",
              },
            }],
          },
          finish_reason: null,
          logprobs: null,
        });
        
        logDebug("Streaming tool use start", {
          claudeId: event.content_block.id,
          openaiId,
          name: event.content_block.name,
        });
        
        return chunk;
      }
      break;

    case "content_block_delta":
      if (event.delta.type === "text_delta") {
        // Text content delta
        chunk.choices.push({
          index: event.index,
          delta: { content: event.delta.text },
          finish_reason: null,
          logprobs: null,
        });
        return chunk;
      } else if (event.delta.type === "input_json_delta") {
        // Tool arguments delta
        chunk.choices.push({
          index: event.index,
          delta: {
            tool_calls: [{
              index: 0,
              function: {
                arguments: event.delta.partial_json,
              },
            }],
          },
          finish_reason: null,
          logprobs: null,
        });
        return chunk;
      }
      break;

    case "message_delta":
      if (event.delta.stop_reason) {
        // Message completion with stop reason
        const finishReason = mapClaudeStopReasonForStream(event.delta.stop_reason);
        chunk.choices.push({
          index: 0,
          delta: {},
          finish_reason: finishReason,
          logprobs: null,
        });
        return chunk;
      } else if (event.usage) {
        // Usage information
        const inputTokens = event.usage.input_tokens ?? 0;
        const outputTokens = event.usage.output_tokens ?? 0;
        chunk.usage = {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        };
        return chunk;
      }
      break;

    case "message_stop":
      // Final chunk
      chunk.choices.push({
        index: 0,
        delta: {},
        finish_reason: "stop",
        logprobs: null,
      });
      return chunk;
  }

  return null;
}

/**
 * Map Claude stop reason to OpenAI finish reason for streaming
 */
function mapClaudeStopReasonForStream(
  stopReason: string
): NonNullable<ChatCompletionChunk.Choice["finish_reason"]> {
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