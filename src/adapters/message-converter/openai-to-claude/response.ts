import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import type { 
  Message as ClaudeMessage,
  TextBlock,
  ToolUseBlock,
  ContentBlock
} from "@anthropic-ai/sdk/resources/messages";
import { UnifiedIdManager as CallIdManager } from "../../../utils/id-management/unified-id-manager";

export function convertOpenAIResponseToClaude(
  openaiResponse: OpenAIResponse,
  manager: CallIdManager
): { message: ClaudeMessage; callIdManager: CallIdManager } {
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
      
      // Generate a unique tool_use_id for Claude
      // OpenAI uses output.id but we need to generate our own for Claude
      const toolUseId = `toolu_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      toolUseBlocks.push({
        type: "tool_use",
        id: toolUseId,
        name: output.name,
        input: JSON.parse(output.arguments || "{}"),
      });
      
      // Store the mapping: from OpenAI's call_id to Claude's tool_use_id
      // The call_id is what will be referenced in future tool results
      if ('call_id' in output && output.call_id) {
        // Don't fix the prefix - keep OpenAI's original call_id format
        const openaiCallId = output.call_id;
        
        // Register in the manager: OpenAI call_id -> Claude tool_use_id
        manager.registerMapping(openaiCallId, toolUseId, output.name, { source: "openai-response" });
        
        console.log(`[OpenAI->Claude] Storing mapping: call_id ${openaiCallId} -> tool_use_id ${toolUseId}`);
      } else if (output.id) {
        // Fallback to using output.id if call_id is not present
        const openaiId = output.id;
        manager.registerMapping(openaiId, toolUseId, output.name, { source: "openai-response-id" });
        console.log(`[OpenAI->Claude] Storing mapping (using id): ${openaiId} -> tool_use_id ${toolUseId}`);
      }
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

  return { message: claudeMessage, callIdManager: manager };
}
