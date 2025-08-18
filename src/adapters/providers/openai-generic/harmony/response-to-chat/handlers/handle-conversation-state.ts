/**
 * Handle conversation state for multi-turn conversations
 */

import type { ResponseCreateParamsBase, ChatCompletionMessageParam } from '../../types';
import { convertInputToMessages } from '../converters/convert-input-to-messages';

export function handleConversationState(params: ResponseCreateParamsBase): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  
  // Handle previous_response_id if present
  if (params.previous_response_id) {
    // In a real implementation, this would fetch the previous response
    // For now, we'll just note that this needs to be handled by the caller
    console.warn(`Previous response ID ${params.previous_response_id} needs to be fetched and processed`);
  }
  
  // Convert input to messages
  if (params.input) {
    const inputMessages = convertInputToMessages(params.input);
    messages.push(...inputMessages);
  }
  
  // Process messages to handle chain-of-thought rules
  // In Harmony format, we would:
  // 1. Keep analysis channel content if there are tool calls
  // 2. Drop analysis channel content for final responses
  // 3. Normalize <|return|> to <|end|> for stored messages
  
  // Since we're converting to ChatCompletion format, these rules
  // would be applied when processing the response, not here
  
  return messages;
}

/**
 * Process assistant messages according to Harmony rules
 * This would be used when processing responses
 */
export function processAssistantMessage(content: string, hasToolCalls: boolean): string {
  // If the message ends with <|return|>, replace with <|end|>
  if (content.endsWith('<|return|>')) {
    content = content.slice(0, -10) + '<|end|>';
  }
  
  // If there are no tool calls and the message contains analysis channel,
  // we might want to filter it out (depending on implementation)
  // For now, we'll keep all content
  
  return content;
}