import type {
  MessageCreateParams as ClaudeMessageCreateParams,
  Tool as ClaudeTool,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseCreateParams as OpenAIResponseCreateParams,
  ResponseInputItem as OpenAIResponseInputItem,
  EasyInputMessage as OpenAIEasyInputMessage,
} from "openai/resources/responses/responses";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { ensureCallIdManager } from "../../../utils/id-management/call-id-helpers";
import { convertOpenAIMessages } from "./message";
import { convertOpenAIToolToClaude } from "./tool-definitions";

/**
 * Convert OpenAI Responses API request to Claude Messages API request
 */
export function openAIToClaude(
  request: OpenAIResponseCreateParams,
  callIdManager: UnifiedIdManager
): ClaudeMessageCreateParams {
  const manager = ensureCallIdManager(callIdManager);
  
  // Convert input items to messages
  const inputItems = request.input || [];
  const normalizedItems: OpenAIResponseInputItem[] =
    typeof inputItems === 'string'
      ? [
          {
            role: 'user',
            content: inputItems,
            type: 'message',
          } as OpenAIEasyInputMessage,
        ]
      : (inputItems as OpenAIResponseInputItem[]);
  const messages = convertOpenAIMessages(normalizedItems, manager);
  
  // Extract system message if present in first message
  let system: string | undefined;
  if (messages.length > 0 && messages[0].role === "assistant" && typeof messages[0].content === "string") {
    // Check if it looks like a system message
    const firstMessage = messages[0].content;
    if (firstMessage.toLowerCase().includes("you are") || firstMessage.toLowerCase().includes("system:")) {
      system = firstMessage;
      messages.shift(); // Remove from messages array
    }
  }
  
  // Convert tools if present
  let tools: ClaudeTool[] | undefined;
  if (request.tools && request.tools.length > 0) {
    tools = request.tools.map(tool => convertOpenAIToolToClaude(tool));
  }
  
  // Build Claude request
  const claudeRequest = {
    model: mapOpenAIModelToClaude(request.model || 'gpt-4'),
    messages: messages,
    max_tokens: request.max_output_tokens || 4096,
  } as ClaudeMessageCreateParams;
  
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
  
  // ResponseCreateParams doesn't have stop_sequences, frequency_penalty, or presence_penalty
  // These are from the Chat Completions API, not Responses API
  
  if (request.stream !== undefined && request.stream !== null) {
    if (request.stream === true) {
      return { ...claudeRequest, stream: true } as ClaudeMessageCreateParams;
    }
  }
  
  return claudeRequest;
}

/**
 * Map OpenAI model names to Claude model names
 */
function mapOpenAIModelToClaude(openAIModel: string): string {
  const modelMap: Record<string, string> = {
    "gpt-4": "claude-3-opus-20240229",
    "gpt-4-turbo": "claude-3-opus-20240229",
    "gpt-4-32k": "claude-3-opus-20240229",
    "gpt-3.5-turbo": "claude-3-sonnet-20240229",
    "gpt-3.5-turbo-16k": "claude-3-sonnet-20240229",
    // Add more mappings as needed
  };
  
  return modelMap[openAIModel] || "claude-3-sonnet-20240229"; // Default to Sonnet
}
