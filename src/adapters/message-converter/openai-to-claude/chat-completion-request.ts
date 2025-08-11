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
    model: mapChatCompletionModelToClaude(request.model),
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

/**
 * Map OpenAI Chat Completion model names to Claude model names
 */
function mapChatCompletionModelToClaude(openAIModel: string): string {
  const modelMap: Record<string, string> = {
    // GPT-4 variants
    "gpt-4": "claude-3-5-sonnet-20241022",
    "gpt-4-turbo": "claude-3-5-sonnet-20241022",
    "gpt-4-turbo-preview": "claude-3-5-sonnet-20241022",
    "gpt-4-32k": "claude-3-5-sonnet-20241022",
    "gpt-4o": "claude-3-5-sonnet-20241022",
    "gpt-4o-mini": "claude-3-haiku-20240307",
    
    // GPT-3.5 variants
    "gpt-3.5-turbo": "claude-3-haiku-20240307",
    "gpt-3.5-turbo-16k": "claude-3-haiku-20240307",
    
    // Pass through Claude models
    "claude-3-opus-20240229": "claude-3-opus-20240229",
    "claude-3-5-sonnet-20241022": "claude-3-5-sonnet-20241022",
    "claude-3-sonnet-20240229": "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307": "claude-3-haiku-20240307",
  };
  
  return modelMap[openAIModel] || "claude-3-5-sonnet-20241022"; // Default to latest Sonnet
}