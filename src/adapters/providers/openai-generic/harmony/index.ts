/**
 * Harmony Prompt Harmonizer
 * 
 * Converts OpenAI Responses API parameters to Harmony format for ChatCompletion API
 */

export { harmonizeResponseParams, extractChatCompletionParams } from './harmonizer';
export type { ResponseCreateParamsBase, ChatCompletionMessageParam, ExtractedChatParams } from './types';

// Export error types
export { ValidationError } from './utils/validate-params';

// Export utility functions if needed externally
export { processAssistantMessage } from './handlers/handle-conversation-state';

// Export Harmony format utilities
export { 
  formatHarmonyMessage,
  formatPartialHarmonyMessage,
  formatToolResponseMessage,
  normalizeStopTokens
} from './utils/format-harmony-message';

export {
  parseToolRecipient,
  formatToolCallMessage,
  formatToolResponse,
  isToolCallMessage,
  extractToolInfoFromMessage
} from './utils/tool-message-utils';

export {
  convertToolCallResult,
  convertAssistantToolCalls,
  isToolMessage,
  filterChainOfThought
} from './converters/convert-tool-messages';

// Export constants
export * from './constants';