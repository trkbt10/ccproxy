import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseFunctionToolCall,
  Tool,
} from "openai/resources/responses/responses";
import type {
  Message as ClaudeMessage,
  MessageStreamEvent,
  ContentBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessage,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { 
  isContentDelta, 
  isContentStart, 
  isContentStop, 
  isInputJsonDelta, 
  isMessageDeltaWithStop, 
  isMessageStop, 
  isTextBlock, 
  isToolUseBlock, 
  isTextDelta,
  hasUsage,
  hasContentArray,
  isResponseOutputText,
  isResponseOutputMessage
} from "./guards";
import { toOpenAICallIdFromClaude } from "../../../utils/conversation/id-conversion";

/**
 * Claude -> OpenAI Responses (non-stream)
 */
export function claudeToOpenAIResponse(
  claude: ClaudeMessage,
  requestModel: string
): OpenAIResponse {
  const { text, items } = extractItemsFromClaude(claude);
  return buildResponse(items, requestModel, claude, text);
}

/**
 * Claude -> OpenAI ChatCompletion (non-stream)
 */
export function claudeToChatCompletion(
  claude: ClaudeMessage,
  requestModel: string
): ChatCompletion {
  const { text, toolCalls } = extractChatContentFromClaude(claude);
  const created = Math.floor(Date.now() / 1000);
  const usage = hasUsage(claude) ? claude.usage : { input_tokens: 0, output_tokens: 0 };
  
  return {
    id: `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created,
    model: requestModel,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        refusal: null,
      },
      finish_reason: claude.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      logprobs: null,
    }],
    usage: {
      prompt_tokens: usage.input_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? 0,
      total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    },
  };
}

/**
 * Claude SSE -> OpenAI ChatCompletion stream
 */
export async function* claudeToChatCompletionStream(
  events: AsyncIterable<MessageStreamEvent>,
  requestModel: string
): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  const id = `chatcmpl_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  let chunkIndex = 0;
  const toolCallsInProgress = new Map<number, { id: string; name: string; args: string }>();
  
  for await (const ev of events) {
    if (isContentStart(ev)) {
      const index = ev.index ?? 0;
      const block = ev.content_block;
      if (isToolUseBlock(block)) {
        const openaiId = toOpenAICallIdFromClaude(block.id);
        toolCallsInProgress.set(index, { id: openaiId, name: block.name, args: "" });
        
        yield {
          id,
          object: 'chat.completion.chunk',
          created,
          model: requestModel,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index,
                id: openaiId,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: '',
                },
              }],
            },
            finish_reason: null,
          }],
        };
      }
    } else if (isContentDelta(ev)) {
      const index = ev.index ?? 0;
      const d = ev.delta;
      if (isTextDelta(d) && d.text) {
        yield {
          id,
          object: 'chat.completion.chunk',
          created,
          model: requestModel,
          choices: [{
            index: 0,
            delta: {
              content: d.text,
            },
            finish_reason: null,
          }],
        };
      } else if (isInputJsonDelta(d)) {
        const t = toolCallsInProgress.get(index);
        if (t && d.partial_json) {
          t.args += d.partial_json;
          yield {
            id,
            object: 'chat.completion.chunk',
            created,
            model: requestModel,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index,
                  function: {
                    arguments: d.partial_json,
                  },
                }],
              },
              finish_reason: null,
            }],
          };
        }
      }
    } else if (isMessageStop(ev)) {
      yield {
        id,
        object: 'chat.completion.chunk',
        created,
        model: requestModel,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
      };
    }
  }
}

function extractChatContentFromClaude(msg: ClaudeMessage): { text: string; toolCalls: ChatCompletionMessageToolCall[] } {
  const toolCalls: ChatCompletionMessageToolCall[] = [];
  const textParts: string[] = [];
  
  if (!hasContentArray(msg)) {
    return { text: '', toolCalls };
  }
  
  for (const block of msg.content) {
    if (isTextBlock(block)) {
      textParts.push(block.text);
    } else if (isToolUseBlock(block)) {
      const args = JSON.stringify(block.input ?? {});
      const openaiId = toOpenAICallIdFromClaude(block.id);
      toolCalls.push({
        id: openaiId,
        type: 'function',
        function: {
          name: block.name,
          arguments: args,
        },
      });
    }
  }
  
  return { text: textParts.join(""), toolCalls };
}

/**
 * Claude SSE -> OpenAI Responses stream
 */
export async function* claudeToOpenAIStream(
  events: AsyncIterable<MessageStreamEvent>,
  requestModel: string,
  requestTools?: Tool[]
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  let createdEmitted = false;
  let sawText = false;
  const toolsMap = new Map<number, { id: string; name: string; args: string }>();
  let sequence = 0;
  let textItemId: string | null = null;
  let contentIndex = 0;
  let accumulatedText = '';
  let completedEmitted = false;
  const outputItems: ResponseOutputItem[] = [];
  for await (const ev of events) {
    
    if (!createdEmitted) {
      createdEmitted = true;
      const created: ResponseStreamEvent = {
        type: 'response.created',
        response: buildEmptyResponse(id, requestModel, requestTools),
        sequence_number: ++sequence,
      } as const;
      yield created;
    }
    if (isContentStart(ev)) {
      const index = ev.index ?? 0;
      const block = ev.content_block;
      if (isToolUseBlock(block)) {
        const openaiId = toOpenAICallIdFromClaude(block.id);
        toolsMap.set(index, { id: openaiId, name: block.name, args: "" });
        const item: ResponseOutputItem = buildFunctionCallItem(openaiId, block.name, undefined);
        outputItems.push(item);
        const added: ResponseStreamEvent = {
          type: 'response.output_item.added',
          item,
          output_index: 0,
          sequence_number: ++sequence,
        } as const;
        yield added;
      }
    } else if (isContentDelta(ev)) {
      const index = ev.index ?? 0;
      const d = ev.delta;
      if (isTextDelta(d)) {
        if (d.text) {
          sawText = true;
          if (!textItemId) {
            textItemId = genId('msg');
            // Add message item with text content to output
            const textContent: ResponseOutputText = {
              type: 'output_text',
              text: '',
              annotations: [],
            };
            const messageItem: ResponseOutputMessage = {
              id: textItemId,
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [textContent],
            };
            outputItems.push(messageItem);
          }
          const deltaEv: ResponseStreamEvent = {
            type: 'response.output_text.delta',
            delta: d.text,
            item_id: textItemId,
            output_index: 0,
            content_index: contentIndex,
            sequence_number: ++sequence,
            logprobs: [],
          } as const;
          yield deltaEv;
          accumulatedText += d.text;
        }
      } else if (isInputJsonDelta(d)) {
        const t = toolsMap.get(index);
        if (t && d.partial_json) {
          t.args += d.partial_json;
          const argsDelta: ResponseStreamEvent = {
            type: 'response.function_call_arguments.delta',
            item_id: t.id,
            output_index: 0,
            sequence_number: ++sequence,
            delta: d.partial_json,
          } as const;
          yield argsDelta;
        }
      }
    } else if (isContentStop(ev)) {
      const index = ev.index ?? 0;
      const t = toolsMap.get(index);
      if (t) {
        const item = buildFunctionCallItem(t.id, t.name, t.args ?? '');
        // Update the item in outputItems
        const itemIndex = outputItems.findIndex(i => i.type === 'function_call' && i.id === t.id);
        if (itemIndex >= 0) {
          outputItems[itemIndex] = item;
        }
        const done: ResponseStreamEvent = {
          type: 'response.output_item.done',
          item,
          output_index: 0,
          sequence_number: ++sequence,
        } as const;
        yield done;
      }
    } else if (isMessageDeltaWithStop(ev)) {
      // Handle stop_reason in delta - don't emit text done here
    } else if (isMessageStop(ev)) {
      // Handle final message stop - emit text done first, then completed
      if (sawText && textItemId) {
        // Update text in outputItems
        const messageItemIndex = outputItems.findIndex(i => isResponseOutputMessage(i));
        if (messageItemIndex >= 0) {
          const messageItem = outputItems[messageItemIndex];
          if (isResponseOutputMessage(messageItem) && messageItem.content.length > 0) {
            const textContent = messageItem.content[0];
            if (isResponseOutputText(textContent)) {
              textContent.text = accumulatedText;
            }
          }
        }
        const done: ResponseStreamEvent = {
          type: 'response.output_text.done',
          item_id: textItemId,
          output_index: 0,
          content_index: contentIndex,
          logprobs: [],
          sequence_number: ++sequence,
          text: accumulatedText,
        } as const;
        yield done;
      }
    }
  }
  
  // Ensure completed event is always emitted at the end
  if (!completedEmitted) {
    const completed: ResponseStreamEvent = {
      type: 'response.completed',
      response: buildCompletedResponse(id, requestModel, outputItems, requestTools),
      sequence_number: ++sequence,
    } as const;
    yield completed;
  }
}

function extractItemsFromClaude(msg: ClaudeMessage): { text: string; items: ResponseOutputItem[] } {
  const items: ResponseOutputItem[] = [];
  const textParts: string[] = [];
  if (!hasContentArray(msg)) {
    return { text: '', items };
  }
  for (const block of msg.content) {
    if (isTextBlock(block)) {
      textParts.push(block.text);
    } else if (isToolUseBlock(block)) {
      const args = JSON.stringify(block.input ?? {});
      const openaiId = toOpenAICallIdFromClaude(block.id);
      items.push(buildFunctionCallItem(openaiId, block.name, args));
    }
  }
  if (textParts.length) {
    items.unshift(buildMessageItem(textParts.join("")));
  }
  return { text: textParts.join(""), items };
}

function buildResponse(items: ResponseOutputItem[], model: string, msg: ClaudeMessage | undefined, text: string): OpenAIResponse {
  const created = Math.floor(Date.now() / 1000);
  const usage = (msg && hasUsage(msg)) ? msg.usage : { input_tokens: 0, output_tokens: 0 };
  const res: OpenAIResponse = {
    id: `resp_${Date.now()}`,
    object: 'response',
    created_at: created,
    model: model,
    status: 'completed',
    output_text: text,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    output: items,
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
  return res;
}

function buildMessageItem(text: string): ResponseOutputMessage {
  const textPart: ResponseOutputText = { type: 'output_text', text, annotations: [] };
  return {
    id: genId('msg'),
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [textPart],
  };
}

function buildFunctionCallItem(id: string, name: string, args?: string): ResponseFunctionToolCall {
  return {
    type: 'function_call',
    id,
    call_id: id,
    name,
    arguments: args ?? '',
  };
}

function buildEmptyResponse(id: string, model: string, tools?: Tool[]): OpenAIResponse {
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: model as unknown as OpenAIResponse['model'],
    status: 'in_progress',
    output_text: '',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    output: [],
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: 'auto',
    tools: tools || [],
    top_p: null,
  };
}

function buildCompletedResponse(id: string, model: string, outputItems?: ResponseOutputItem[], tools?: Tool[]): OpenAIResponse {
  // Calculate output_text from message items with text content
  const outputText = outputItems
    ?.filter(isResponseOutputMessage)
    .flatMap(msg => msg.content)
    .filter(isResponseOutputText)
    .map(item => item.text)
    .join('') || '';
    
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: model,
    status: 'completed',
    output_text: outputText,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    output: outputItems || [],
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: 'auto',
    tools: tools || [],
    top_p: null,
  };
}

function genId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${randomPart}`;
}
