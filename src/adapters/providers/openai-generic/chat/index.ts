/**
 * @fileoverview Chat Completions API module exports
 * 
 * Why: Provides organized exports for chat-related functionality,
 * maintaining clear boundaries between different API concerns.
 */

export {
  extractTextFromContent,
  mapChatToolsToResponses,
  convertOpenAIChatToolToResponsesTool,
  mapChatToolChoiceToResponses,
  buildResponseInputFromChatMessages
} from './params/converter';

export {
  isOpenAIChatTextPart,
  isOpenAIChatFunctionTool,
  isOpenAIChatFunctionToolChoice,
  isOpenAIChatBasicRole
} from './guards';