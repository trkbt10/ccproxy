/**
 * Harmony Prompt Harmonizer
 * 
 * This module synthesizes OpenAI Responses API parameters into Harmony format prompts
 * for ChatCompletion API calls. The Harmony format is used by gpt-oss models for
 * structured conversation, reasoning, and function calling.
 * 
 * Key responsibilities:
 * 1. Convert ResponseCreateParams to ChatCompletion messages in Harmony format
 * 2. Generate proper system messages with reasoning levels and metadata
 * 3. Transform developer instructions and tools into proper format
 * 4. Handle input conversion (text, messages, files, etc.)
 * 5. Manage tool definitions and function calling setup
 */

import type { ResponseCreateParamsBase, ChatCompletionMessageParam } from './types';
import { HARMONY_ROLES } from './constants';
import { validateParams } from './utils/validate-params';
import { generateSystemMessage } from './generators/generate-system-message';
import { generateDeveloperMessage } from './generators/generate-developer-message';
import { handleConversationState } from './handlers/handle-conversation-state';
import { formatPartialHarmonyMessage } from './utils/format-harmony-message';

/**
 * Main harmonizer function that converts Response API params to ChatCompletion messages
 * 
 * @param params - OpenAI Response API parameters
 * @param knowledgeCutoff - Optional knowledge cutoff date for the model
 * @returns Array of ChatCompletion messages in Harmony format
 */
export function harmonizeResponseParams(
  params: ResponseCreateParamsBase,
  knowledgeCutoff: string = '2024-06'
): ChatCompletionMessageParam[] {
  // Validate input parameters
  validateParams(params);
  
  const messages: ChatCompletionMessageParam[] = [];
  
  // 1. Generate system message (always present)
  const systemMessage = generateSystemMessage(params, knowledgeCutoff);
  messages.push({
    role: 'system',
    content: systemMessage
  });
  
  // 2. Generate developer message (if needed)
  const developerMessage = generateDeveloperMessage(params);
  if (developerMessage) {
    messages.push({
      role: 'system', // Developer messages map to system role in ChatCompletion
      content: developerMessage
    });
  }
  
  // 3. Handle conversation state and input messages
  const conversationMessages = handleConversationState(params);
  messages.push(...conversationMessages);
  
  // 4. Add the partial assistant message to prompt completion
  // The model will continue from this point
  // Note: No channel specified - model will decide based on context
  const assistantPrompt = formatPartialHarmonyMessage(HARMONY_ROLES.ASSISTANT);
  messages.push({
    role: 'assistant',
    content: assistantPrompt
  });
  
  return messages;
}

/**
 * Extract ChatCompletion-compatible parameters from Response API params
 * Re-export for convenience
 */
export { extractChatCompletionParams } from './utils/extract-chat-params';

/**
 * Export types for external use
 */
export type { ResponseCreateParamsBase, ChatCompletionMessageParam, ExtractedChatParams } from './types';