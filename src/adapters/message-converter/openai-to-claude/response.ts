import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import type { 
  Message as ClaudeMessage,
  TextBlock,
  ToolUseBlock,
  ContentBlock
} from "@anthropic-ai/sdk/resources/messages";
import { toClaudeToolUseIdFromOpenAI } from "../../../utils/conversation/id-conversion";

export function convertOpenAIResponseToClaude(
  openaiResponse: OpenAIResponse
): { message: ClaudeMessage } {
  // Collect all text content
  const textContent: string[] = [];
  const toolUseBlocks: ToolUseBlock[] = [];

  // Process output items
  for (const output of openaiResponse.output || []) {
    if (output.type === "message" && output.content) {
      for (const contentItem of output.content) {
        if (contentItem.type === "output_text") {
          textContent.push(contentItem.text);
        }
      }
    } else if (output.type === "function_call" && output.id) {
      console.log(`[OpenAI->Claude] function_call output:`, {
        id: output.id,
        call_id: 'call_id' in output ? output.call_id : undefined,
        name: output.name,
        type: output.type
      });
      
      // Deterministically derive a Claude tool_use_id from the OpenAI call_id/id
      const sourceId = ('call_id' in output && output.call_id) ? output.call_id : output.id;
      const toolUseId = toClaudeToolUseIdFromOpenAI(sourceId);
      
      toolUseBlocks.push({
        type: "tool_use",
        id: toolUseId,
        name: output.name,
        input: JSON.parse(output.arguments || "{}"),
      });
      
      // No mapping registry needed — conversion is deterministic
    }
  }

  // Build content array
  const content: ContentBlock[] = [];

  // Add text content if any
  if (textContent.length > 0) {
    const textBlock: TextBlock = {
      type: "text",
      text: textContent.join(""),
      citations: [],
    };
    content.push(textBlock);
  }

  // Add tool use blocks
  content.push(...toolUseBlocks);

  // Determine stop reason
  let stopReason: ClaudeMessage["stop_reason"] = "end_turn";
  if (openaiResponse.status === "incomplete") {
    if (openaiResponse.incomplete_details?.reason === "max_output_tokens") {
      stopReason = "max_tokens";
    }
  } else if (toolUseBlocks.length > 0) {
    stopReason = "tool_use";
  }

  const claudeMessage: ClaudeMessage = {
    id: `msg_${Date.now()}`, // Generate a unique ID
    type: "message",
    role: "assistant",
    model: "claude-3-5-sonnet-20241022", // Default model
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openaiResponse.usage?.input_tokens || 0,
      output_tokens: openaiResponse.usage?.output_tokens || 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  };

  return { message: claudeMessage };
}
