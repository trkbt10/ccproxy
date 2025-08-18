/**
 * Harmony Response Parser
 * 
 * Parses Harmony format messages and extracts structured data
 * including channels, tool calls, and reasoning
 */

import { createStreamingMarkdownParser } from '../../../../../utils/markdown/streaming-parser';
import type { MarkdownParseEvent, DeltaEvent } from '../../../../../utils/markdown/types';
import type { 
  HarmonyMessage, 
  ParsedHarmonyMessage, 
  ParsedHarmonyResponse,
  HarmonyParserState 
} from './types';

const HARMONY_START_TOKEN = '<|start|>';
const HARMONY_END_TOKEN = '<|end|>';
const HARMONY_MESSAGE_TOKEN = '<|message|>';
const HARMONY_CHANNEL_TOKEN = '<|channel|>';
const HARMONY_CONSTRAIN_TOKEN = '<|constrain|>';
const HARMONY_RETURN_TOKEN = '<|return|>';
const HARMONY_CALL_TOKEN = '<|call|>';

/**
 * Parse a complete Harmony response
 */
export const parseHarmonyResponse = async (response: HarmonyMessage): Promise<ParsedHarmonyResponse> => {
  const content = response.content || '';
  const messages: ParsedHarmonyMessage[] = [];
  let currentReasoning = '';

  // Handle pre-parsed responses (from ChatCompletion API)
  if (response.reasoning) {
    currentReasoning = response.reasoning;
  }

  // Parse Harmony format content
  if (content.includes(HARMONY_START_TOKEN)) {
    const parsed = await parseHarmonyContent(content);
    messages.push(...parsed.messages);
    
    // Extract reasoning from analysis channel
    const analysisMessages = parsed.messages.filter(m => m.channel === 'analysis');
    if (analysisMessages.length > 0 && !currentReasoning) {
      currentReasoning = analysisMessages.map(m => m.content).join('\n\n');
    }
  } else if (content) {
    // Plain content - treat as final message
    messages.push({
      channel: 'final',
      content: content
    });
  }

  // Extract tool calls
  const toolCalls = normalizeToolCalls(response.tool_calls) || extractToolCalls(messages);

  return {
    messages,
    reasoning: currentReasoning || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
};

/**
 * Parse Harmony formatted content
 */
const parseHarmonyContent = async (content: string): Promise<{ messages: ParsedHarmonyMessage[] }> => {
  const state: HarmonyParserState = {
    currentMessage: null,
    messages: [],
    inMessage: false,
    buffer: '',
    expectingContent: false
  };

  // Split by tokens and process
  const lines = content.split('\n');
  let endTokenProcessed = false;
  
  for (const line of lines) {
    if (line.includes(HARMONY_START_TOKEN)) {
      state.inMessage = true;
      continue;
    }

    if (line.includes(HARMONY_END_TOKEN)) {
      // Finalize any pending message
      if (state.currentMessage && state.buffer.trim()) {
        state.currentMessage.content = state.buffer.trim();
        state.messages.push(state.currentMessage as ParsedHarmonyMessage);
      }
      endTokenProcessed = true;
      break;
    }

    if (state.inMessage) {
      if (line.includes(HARMONY_MESSAGE_TOKEN)) {
        // Save previous message if exists
        if (state.currentMessage && state.buffer.trim()) {
          state.currentMessage.content = state.buffer.trim();
          state.messages.push(state.currentMessage as ParsedHarmonyMessage);
        }
        
        // Start new message
        state.currentMessage = { channel: 'final', content: '' };
        state.buffer = '';
        state.expectingContent = false;
        state.currentRole = extractRole(line);
        continue;
      }

      if (line.includes(HARMONY_CHANNEL_TOKEN)) {
        const channel = extractValue(line, HARMONY_CHANNEL_TOKEN);
        if (state.currentMessage && channel) {
          state.currentMessage.channel = channel as 'analysis' | 'commentary' | 'final';
        }
        continue;
      }

      if (line.includes(HARMONY_CONSTRAIN_TOKEN)) {
        const constrainType = extractValue(line, HARMONY_CONSTRAIN_TOKEN);
        if (state.currentMessage && constrainType) {
          state.currentMessage.constrainType = constrainType;
        }
        continue;
      }

      if (line.includes(HARMONY_RETURN_TOKEN) || line.includes(HARMONY_CALL_TOKEN)) {
        const recipient = extractValue(line, HARMONY_RETURN_TOKEN) || 
                        extractValue(line, HARMONY_CALL_TOKEN);
        if (state.currentMessage && recipient) {
          state.currentMessage.recipient = recipient;
          state.currentMessage.isToolCall = line.includes(HARMONY_CALL_TOKEN);
        }
        state.expectingContent = true;
        continue;
      }

      // Accumulate content
      if (state.expectingContent || !isHarmonyToken(line)) {
        state.buffer += (state.buffer ? '\n' : '') + line;
      }
    }
  }

  // Finalize last message if not already finalized by END token
  if (!endTokenProcessed && state.currentMessage && state.buffer.trim()) {
    state.currentMessage.content = state.buffer.trim();
    state.messages.push(state.currentMessage as ParsedHarmonyMessage);
  }

  return { messages: state.messages };
};

/**
 * Extract role from message line
 */
const extractRole = (line: string): string | undefined => {
  const match = line.match(/role="([^"]+)"/);
  return match ? match[1] : undefined;
};

/**
 * Extract value after a token
 */
const extractValue = (line: string, token: string): string | undefined => {
  const index = line.indexOf(token);
  if (index === -1) return undefined;
  
  const afterToken = line.substring(index + token.length).trim();
  
  // Handle quoted values
  const quotedMatch = afterToken.match(/^"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];
  
  // Handle unquoted values (take until next token or end)
  const unquotedMatch = afterToken.match(/^([^<\s]+)/);
  return unquotedMatch ? unquotedMatch[1] : undefined;
};

/**
 * Check if line contains Harmony token
 */
const isHarmonyToken = (line: string): boolean => {
  return line.includes('<|') && line.includes('|>');
};

/**
 * Process markdown content within a message
 */
const processMarkdownContent = async (content: string): Promise<string> => {
  const markdownParser = createStreamingMarkdownParser({
    preserveWhitespace: true
  });
  
  let processedContent = '';
  
  for await (const event of markdownParser.processChunk(content)) {
    if (event.type === 'delta') {
      processedContent += event.content;
    }
  }

  // Complete remaining content
  for await (const event of markdownParser.complete()) {
    if (event.type === 'delta') {
      processedContent += event.content;
    }
  }

  return processedContent;
};

/**
 * Normalize tool calls from various formats
 */
const normalizeToolCalls = (toolCalls?: HarmonyMessage['tool_calls']): Array<{ id: string; name: string; arguments: string }> | null => {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return toolCalls.map(tc => normalizeToolCall(tc));
};

/**
 * Normalize a single tool call
 */
const normalizeToolCall = (tc: NonNullable<HarmonyMessage['tool_calls']>[0]): { id: string; name: string; arguments: string } => {
  // OpenAI format
  if ('function' in tc && tc.type === 'function') {
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments
    };
  }
  
  // Already in our format - use type assertion after check
  const tcAny = tc as any;
  if ('name' in tcAny && 'arguments' in tcAny) {
    return {
      id: tcAny.id,
      name: tcAny.name as string,
      arguments: tcAny.arguments as string
    };
  }
  
  // Fallback - this should never happen with proper types
  return {
    id: tc.id,
    name: 'unknown',
    arguments: '{}'
  };
};

/**
 * Extract tool calls from parsed messages
 */
const extractToolCalls = (messages: ParsedHarmonyMessage[]): Array<{ id: string; name: string; arguments: string }> => {
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

  for (const message of messages) {
    if (message.isToolCall && message.recipient && message.content) {
      // Extract function name from recipient (e.g., "functions.get_weather" -> "get_weather")
      const functionName = message.recipient.includes('.') 
        ? message.recipient.split('.').pop()! 
        : message.recipient;

      // Generate a unique ID
      const id = `fc_${Math.random().toString(36).substring(2, 15)}`;

      toolCalls.push({
        id,
        name: functionName,
        arguments: message.content
      });
    }
  }

  return toolCalls;
};

// For backward compatibility with tests
export const createHarmonyResponseParser = () => {
  return {
    parseResponse: parseHarmonyResponse,
    parseHarmonyContent,
    processMarkdownContent
  };
};