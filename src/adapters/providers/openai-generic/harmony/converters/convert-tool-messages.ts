/**
 * Convert tool-related messages to Harmony format
 */

import type { ChatCompletionMessageParam } from '../types';
import { HARMONY_ROLES } from '../constants';
import { formatHarmonyMessage } from '../utils/format-harmony-message';
import { formatToolResponse, parseToolRecipient } from '../utils/tool-message-utils';

/**
 * Convert a tool call result to Harmony format
 */
export function convertToolCallResult(
  toolCallId: string,
  toolName: string,
  result: string
): ChatCompletionMessageParam {
  // Format the tool response message
  const content = formatToolResponse(toolName, result);
  
  return {
    role: 'assistant', // Tool messages are rendered as assistant messages in ChatCompletion
    content
  };
}

/**
 * Convert assistant tool calls to Harmony format
 * This would be used when processing assistant messages that contain tool calls
 */
export function convertAssistantToolCalls(
  toolCalls: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>
): string[] {
  const messages: string[] = [];
  
  for (const toolCall of toolCalls) {
    const toolInfo = parseToolRecipient(toolCall.function.name);
    if (!toolInfo) {
      continue;
    }
    
    // Format as Harmony tool call message
    const message = formatHarmonyMessage({
      role: HARMONY_ROLES.ASSISTANT,
      channel: toolInfo.channel,
      recipient: toolCall.function.name,
      constrainType: toolInfo.constraintType,
      content: toolCall.function.arguments
    });
    
    messages.push(message);
  }
  
  return messages;
}

/**
 * Check if a message is a tool message
 */
export function isToolMessage(message: ChatCompletionMessageParam): boolean {
  return message.role === 'tool' || 
    (message.role === 'assistant' && typeof message.content === 'string' && (
     message.content.includes('<|start|>functions.') || 
     message.content.includes('<|start|>browser.') ||
     message.content.includes('<|start|>python')));
}

/**
 * Extract chain of thought from assistant messages
 * According to spec, we should drop analysis channel content for final responses
 * but keep it for tool calls
 */
export function filterChainOfThought(
  messages: string[],
  hasToolCalls: boolean
): string[] {
  if (hasToolCalls) {
    // Keep all messages including analysis channel
    return messages;
  }
  
  // Filter out analysis channel messages
  return messages.filter(msg => !msg.includes('<|channel|>analysis'));
}