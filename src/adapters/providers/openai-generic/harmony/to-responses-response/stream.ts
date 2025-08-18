/**
 * Streaming converter for Harmony to Responses API
 * 
 * Provides real-time streaming conversion of Harmony responses
 */

import { parseHarmonyResponse } from './parser';
import { convertHarmonyToResponses } from './converter';
import type { HarmonyToResponsesOptions } from './types';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

export async function* createHarmonyToResponsesStream(
  chunks: AsyncIterable<string>,
  options: HarmonyToResponsesOptions = {}
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  // Stream mode is always enabled for streaming
  
  let buffer = '';
  let harmonyStarted = false;
  let harmonyEnded = false;
  
  for await (const chunk of chunks) {
    buffer += chunk;
    
    // Wait for complete Harmony response
    if (!harmonyStarted && buffer.includes('<|start|>')) {
      harmonyStarted = true;
    }
    
    if (harmonyStarted && buffer.includes('<|end|>')) {
      harmonyEnded = true;
      
      // Parse and convert the complete response
      const harmonyMessage = {
        role: 'assistant',
        content: buffer
      };
      
      const events = await convertHarmonyToResponses(harmonyMessage, { ...options, stream: true });
      
      // Yield all events
      for (const event of events) {
        yield event;
      }
      
      // Reset for potential next response
      buffer = '';
      harmonyStarted = false;
      harmonyEnded = false;
    }
  }
  
  // Handle any remaining content
  if (buffer.trim()) {
    const harmonyMessage = {
      role: 'assistant',
      content: buffer
    };
    
    const events = await convertHarmonyToResponses(harmonyMessage, { ...options, stream: true });
    
    for (const event of events) {
      yield event;
    }
  }
}