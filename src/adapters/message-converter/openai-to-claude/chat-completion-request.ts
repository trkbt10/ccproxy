import type {
  MessageCreateParams as ClaudeMessageCreateParams,
  Tool as ClaudeTool,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletionCreateParams,
} from "openai/resources/chat/completions";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { ensureCallIdManager } from "../../../utils/id-management/call-id-helpers";
import { convertChatCompletionMessages } from "./chat-completion-message";
import { convertChatCompletionToolToClaude } from "./tool-definitions";
import { mapModelToProvider } from "../../providers/shared/model-mapper";

/**
 * Convert OpenAI Chat Completions API request to Claude Messages API request
 */
export function chatCompletionToClaude(
  request: ChatCompletionCreateParams,
  callIdManager: UnifiedIdManager
): ClaudeMessageCreateParams {
  const manager = ensureCallIdManager(callIdManager);
  
  // Convert messages
  const { messages, system } = convertChatCompletionMessages(request.messages, manager);
  
  // Convert tools if present
  let tools: ClaudeTool[] | undefined;
  if (request.tools && request.tools.length > 0) {
    tools = request.tools
      .filter(tool => tool.type === "function")
      .map(tool => convertChatCompletionToolToClaude(tool));
  }
  
  // Build Claude request
  const claudeRequest: ClaudeMessageCreateParams = {
    model: mapModelToProvider({ targetProviderType: "claude", sourceModel: String(request.model) }),
    messages: messages,
    max_tokens: request.max_completion_tokens || request.max_tokens || 4096,
    stream: request.stream || false,
  };
  
  // Add optional parameters
  if (system) {
    claudeRequest.system = system;
  }
  
  if (tools && tools.length > 0) {
    claudeRequest.tools = tools;
  }
  
  if (request.temperature !== undefined && request.temperature !== null) {
    claudeRequest.temperature = request.temperature;
  }
  
  if (request.top_p !== undefined && request.top_p !== null) {
    claudeRequest.top_p = request.top_p;
  }
  
  // Handle tool choice
  if (request.tool_choice) {
    if (request.tool_choice === "none") {
      claudeRequest.tool_choice = { type: "none" };
    } else if (request.tool_choice === "required" || request.tool_choice === "auto") {
      claudeRequest.tool_choice = { type: "any" };
    } else if (typeof request.tool_choice === "object" && request.tool_choice.type === "function") {
      claudeRequest.tool_choice = { 
        type: "tool", 
        name: request.tool_choice.function.name 
      };
    }
  }
  
  // Handle stop sequences
  if (request.stop) {
    if (typeof request.stop === "string") {
      claudeRequest.stop_sequences = [request.stop];
    } else if (Array.isArray(request.stop)) {
      claudeRequest.stop_sequences = request.stop;
    }
  }
  
  return claudeRequest;
}
// model mapping now centralized in providers/shared/model-mapper
