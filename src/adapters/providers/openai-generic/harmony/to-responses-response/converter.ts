/**
 * Harmony to Responses API Converter
 * 
 * Converts parsed Harmony messages to OpenAI Responses API events
 */

import { createStreamingMarkdownParser } from '../../../../../utils/markdown/streaming-parser';
import type { MarkdownParseEvent, DeltaEvent } from '../../../../../utils/markdown/types';
import { parseHarmonyResponse } from './parser';
import type {
  HarmonyMessage,
  HarmonyToResponsesOptions,
  ParsedHarmonyMessage,
  ParsedHarmonyResponse
} from './types';
import type { 
  ResponseStreamEvent,
  ResponseCreatedEvent,
  ResponseCompletedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseOutputMessage,
  ResponseFunctionToolCall
} from 'openai/resources/responses/responses';

/**
 * Convert a Harmony response to Responses API format
 */
export const convertHarmonyToResponses = async (
  response: HarmonyMessage,
  options: HarmonyToResponsesOptions = {}
): Promise<ResponseStreamEvent[]> => {
  const events: ResponseStreamEvent[] = [];
  const parsed = await parseHarmonyResponse(response);
  
  const defaultOptions = {
    idPrefix: 'harmony',
    stream: false,
    ...options
  };
  
  const responseId = defaultOptions.requestId || `${defaultOptions.idPrefix}_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  
  // Track indices for events
  let sequenceNumber = 0;
  let outputIndex = 0;
  let contentIndex = 0;

  // Add response.created event
  events.push(createResponseCreated(responseId, created, defaultOptions.model || 'unknown', sequenceNumber++));

  // Process reasoning text if present
  if (parsed.reasoning) {
    const reasoningItemId = `${responseId}_reasoning`;
    const reasoningItem = createReasoningItem(reasoningItemId, parsed.reasoning);
    
    events.push(createOutputItemAdded(reasoningItem, sequenceNumber++, outputIndex++));
    
    if (defaultOptions.stream) {
      // Stream reasoning in chunks
      const chunks = splitIntoChunks(parsed.reasoning, 100);
      for (const chunk of chunks) {
        const event = createTextDelta(reasoningItemId, chunk, outputIndex - 1, contentIndex, sequenceNumber++);
        contentIndex = event.content_index + event.delta.length;
        events.push(event);
      }
    } else {
      // Add complete reasoning as single delta
      const event = createTextDelta(reasoningItemId, parsed.reasoning, outputIndex - 1, contentIndex, sequenceNumber++);
      contentIndex = event.content_index + event.delta.length;
      events.push(event);
    }
    
    events.push(createTextDone(reasoningItemId, parsed.reasoning, outputIndex - 1, contentIndex, sequenceNumber++));
    events.push(createOutputItemDone(reasoningItem, sequenceNumber++, outputIndex - 1));
  }

  // Process tool calls
  if (parsed.toolCalls && parsed.toolCalls.length > 0) {
    for (const toolCall of parsed.toolCalls) {
      const toolItemId = `${responseId}_tool_${toolCall.id}`;
      const toolItem = createFunctionCallItem(toolItemId, toolCall);
      
      events.push(createOutputItemAdded(toolItem, sequenceNumber++, outputIndex++));
      
      if (defaultOptions.stream) {
        // Stream function name
        events.push(createFunctionCallArgumentsDelta(
          toolItemId, 
          outputIndex - 1,
          sequenceNumber++
        ));
        
        // Stream arguments in chunks
        const argChunks = splitIntoChunks(toolCall.arguments, 50);
        for (const chunk of argChunks) {
          events.push(createFunctionCallArgumentsDelta(
            toolItemId,
            outputIndex - 1,
            sequenceNumber++,
            chunk
          ));
        }
      }
      
      events.push(createFunctionCallArgumentsDone(
        toolItemId,
        outputIndex - 1,
        toolCall.arguments,
        sequenceNumber++
      ));
      events.push(createOutputItemDone(toolItem, sequenceNumber++, outputIndex - 1));
    }
  }

  // Process final message content
  const finalMessages = parsed.messages.filter(m => m.channel === 'final');
  if (finalMessages.length > 0) {
    const textItemId = `${responseId}_text`;
    const fullText = finalMessages.map(m => m.content).join('\n\n');
    const textItem = createMessageItem(textItemId, fullText);
    
    events.push(createOutputItemAdded(textItem, sequenceNumber++, outputIndex++));
    
    // Reset content index for new item
    contentIndex = 0;
    
    if (defaultOptions.stream) {
      // Stream text in chunks
      const chunks = splitIntoChunks(fullText, 50);
      for (const chunk of chunks) {
        const event = createTextDelta(textItemId, chunk, outputIndex - 1, contentIndex, sequenceNumber++);
        contentIndex = event.content_index + event.delta.length;
        events.push(event);
      }
    } else {
      // Add complete text as single delta
      const event = createTextDelta(textItemId, fullText, outputIndex - 1, contentIndex, sequenceNumber++);
      contentIndex = event.content_index + event.delta.length;
      events.push(event);
    }
    
    events.push(createTextDone(textItemId, fullText, outputIndex - 1, contentIndex, sequenceNumber++));
    events.push(createOutputItemDone(textItem, sequenceNumber++, outputIndex - 1));
  }

  // Add response.completed event
  events.push(createResponseCompleted(
    responseId, 
    created,
    defaultOptions.model || 'unknown',
    buildOutputArray(parsed, responseId),
    sequenceNumber++
  ));

  return events;
};

const createResponseCreated = (
  responseId: string, 
  created: number, 
  model: string, 
  sequenceNumber: number
): ResponseCreatedEvent => {
  return {
    type: 'response.created',
    response: {
      id: responseId,
      created_at: created,
      output_text: '',
      error: null,
      incomplete_details: null,
      instructions: null,
      metadata: null,
      model,
      object: 'response',
      output: [],
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: 'auto',
      tools: [],
      top_p: null,
      status: 'in_progress'
    },
    sequence_number: sequenceNumber
  };
};

const createResponseCompleted = (
  responseId: string, 
  created: number,
  model: string,
  output: Array<ResponseOutputMessage | ResponseFunctionToolCall>,
  sequenceNumber: number
): ResponseCompletedEvent => {
  return {
    type: 'response.completed',
    response: {
      id: responseId,
      created_at: created,
      output_text: extractOutputText(output),
      error: null,
      incomplete_details: null,
      instructions: null,
      metadata: null,
      model,
      object: 'response',
      output,
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: 'auto',
      tools: [],
      top_p: null,
      status: 'completed'
    },
    sequence_number: sequenceNumber
  };
};

const createOutputItemAdded = (
  item: ResponseOutputMessage | ResponseFunctionToolCall,
  sequenceNumber: number,
  outputIndex: number
): ResponseOutputItemAddedEvent => {
  return {
    type: 'response.output_item.added',
    sequence_number: sequenceNumber,
    output_index: outputIndex,
    item
  };
};

const createOutputItemDone = (
  item: ResponseOutputMessage | ResponseFunctionToolCall,
  sequenceNumber: number,
  outputIndex: number
): ResponseOutputItemDoneEvent => {
  return {
    type: 'response.output_item.done',
    sequence_number: sequenceNumber,
    output_index: outputIndex,
    item
  };
};

const createTextDelta = (
  itemId: string, 
  text: string,
  outputIndex: number,
  contentIndex: number,
  sequenceNumber: number
): ResponseTextDeltaEvent => {
  return {
    type: 'response.output_text.delta',
    delta: text,
    item_id: itemId,
    output_index: outputIndex,
    content_index: contentIndex,
    logprobs: [],
    sequence_number: sequenceNumber
  };
};

const createTextDone = (
  itemId: string, 
  text: string,
  outputIndex: number,
  contentIndex: number,
  sequenceNumber: number
): ResponseTextDoneEvent => {
  return {
    type: 'response.output_text.done',
    item_id: itemId,
    output_index: outputIndex,
    content_index: contentIndex,
    logprobs: [],
    sequence_number: sequenceNumber,
    text
  };
};

const createFunctionCallArgumentsDelta = (
  itemId: string,
  outputIndex: number,
  sequenceNumber: number,
  args: string = ''
): ResponseFunctionCallArgumentsDeltaEvent => {
  return {
    type: 'response.function_call_arguments.delta',
    item_id: itemId,
    output_index: outputIndex,
    delta: args,
    sequence_number: sequenceNumber
  };
};

const createFunctionCallArgumentsDone = (
  itemId: string,
  outputIndex: number,
  args: string,
  sequenceNumber: number
): ResponseFunctionCallArgumentsDoneEvent => {
  return {
    type: 'response.function_call_arguments.done',
    item_id: itemId,
    output_index: outputIndex,
    arguments: args,
    sequence_number: sequenceNumber
  };
};

const createMessageItem = (itemId: string, text: string): ResponseOutputMessage => {
  return {
    id: itemId,
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text,
      annotations: []
    }],
    status: 'completed'
  };
};

const createReasoningItem = (itemId: string, reasoning: string): ResponseOutputMessage => {
  // Note: Using message type for reasoning as there's no specific reasoning item type
  return {
    id: itemId,
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text: reasoning,
      annotations: []
    }],
    status: 'completed'
  };
};

const createFunctionCallItem = (
  itemId: string, 
  toolCall: { id: string; name: string; arguments: string }
): ResponseFunctionToolCall => {
  return {
    id: itemId,
    type: 'function_call',
    call_id: toolCall.id,
    name: toolCall.name,
    arguments: toolCall.arguments,
    status: 'completed'
  };
};

/**
 * Build the output array for the completed response
 */
const buildOutputArray = (
  parsed: ParsedHarmonyResponse, 
  responseId: string
): Array<ResponseOutputMessage | ResponseFunctionToolCall> => {
  const output: Array<ResponseOutputMessage | ResponseFunctionToolCall> = [];

  if (parsed.reasoning) {
    output.push(createReasoningItem(`${responseId}_reasoning`, parsed.reasoning));
  }

  if (parsed.toolCalls) {
    for (const toolCall of parsed.toolCalls) {
      output.push(createFunctionCallItem(`${responseId}_tool_${toolCall.id}`, toolCall));
    }
  }

  const finalMessages = parsed.messages.filter(m => m.channel === 'final');
  if (finalMessages.length > 0) {
    const fullText = finalMessages.map(m => m.content).join('\n\n');
    output.push(createMessageItem(`${responseId}_text`, fullText));
  }

  return output;
};

/**
 * Extract output text from output array
 */
const extractOutputText = (output: Array<ResponseOutputMessage | ResponseFunctionToolCall>): string => {
  const textItems = output.filter((item): item is ResponseOutputMessage => item.type === 'message');
  if (textItems.length === 0) return '';
  
  const lastTextItem = textItems[textItems.length - 1];
  const textContent = lastTextItem.content?.find(c => c.type === 'output_text');
  return textContent && 'text' in textContent ? textContent.text : '';
};

/**
 * Split text into chunks for streaming
 */
const splitIntoChunks = (text: string, chunkSize: number): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
};

// For backward compatibility with tests
export const createHarmonyToResponsesConverter = (options: HarmonyToResponsesOptions = {}) => {
  return {
    convert: (response: HarmonyMessage) => convertHarmonyToResponses(response, options)
  };
};