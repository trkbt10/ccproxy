/**
 * @fileoverview Responses API module exports
 * 
 * Why: Provides organized exports for responses-related functionality,
 * maintaining clear boundaries between different API concerns.
 */

export {
  isResponseEventStream,
  isResponseStreamEvent,
  ensureOpenAIResponseStream,
  isOpenAIResponse,
  responseHasFunctionCall,
  isOpenAIResponsesFunctionTool
} from './guards';