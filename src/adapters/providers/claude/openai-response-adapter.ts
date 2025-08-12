import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";
import type {
  Message as ClaudeMessage,
  MessageStreamEvent,
  ContentBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { isContentDelta, isContentStart, isContentStop, isInputJsonDelta, isMessageDeltaWithStop, isMessageStop, isTextBlock, isToolUseBlock, isTextDelta } from "./guards";
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
 * Claude SSE -> OpenAI Responses stream
 */
export async function* claudeToOpenAIStream(
  events: AsyncIterable<MessageStreamEvent>,
  requestModel: string
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  let createdEmitted = false;
  let sawText = false;
  const tools = new Map<number, { id: string; name: string; args: string }>();
  let sequence = 0;
  let textItemId: string | null = null;
  let contentIndex = 0;
  let accumulatedText = '';
  for await (const ev of events) {
    if (!createdEmitted) {
      createdEmitted = true;
      const created: ResponseStreamEvent = {
        type: 'response.created',
        response: buildEmptyResponse(id, requestModel),
        sequence_number: ++sequence,
      } as const;
      yield created;
    }
    if (isContentStart(ev)) {
      const index = ev.index ?? 0;
      const block = ev.content_block as ContentBlock;
      if (isToolUseBlock(block)) {
        const openaiId = toOpenAICallIdFromClaude(block.id);
        tools.set(index, { id: openaiId, name: block.name, args: "" });
        const item: ResponseOutputItem = buildFunctionCallItem(openaiId, block.name, undefined);
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
          if (!textItemId) textItemId = genId('msg');
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
        const t = tools.get(index);
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
      const t = tools.get(index);
      if (t) {
        const item = buildFunctionCallItem(t.id, t.name, t.args ?? '');
        const done: ResponseStreamEvent = {
          type: 'response.output_item.done',
          item,
          output_index: 0,
          sequence_number: ++sequence,
        } as const;
        yield done;
      }
    } else if (isMessageDeltaWithStop(ev) || isMessageStop(ev)) {
      if (sawText && textItemId) {
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
      const completed: ResponseStreamEvent = {
        type: 'response.completed',
        response: buildCompletedResponse(id, requestModel),
        sequence_number: ++sequence,
      } as const;
      yield completed;
    }
  }
}

function extractItemsFromClaude(msg: ClaudeMessage): { text: string; items: ResponseOutputItem[] } {
  const items: ResponseOutputItem[] = [];
  const textParts: string[] = [];
  for (const block of msg.content as ContentBlock[]) {
    if (isTextBlock(block)) {
      textParts.push(block.text);
    } else if (isToolUseBlock(block)) {
      const args = JSON.stringify((block as { input?: unknown }).input ?? {});
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
  const usage: { input_tokens?: number; output_tokens?: number } = (msg && (msg as unknown as { usage?: { input_tokens?: number; output_tokens?: number } }).usage) || {};
  const res: OpenAIResponse = {
    id: `resp_${Date.now()}`,
    object: 'response',
    created_at: created,
    model: model as unknown as OpenAIResponse['model'],
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

function buildEmptyResponse(id: string, model: string): OpenAIResponse {
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
    tools: [],
    top_p: null,
  } as OpenAIResponse;
}

function buildCompletedResponse(id: string, model: string): OpenAIResponse {
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: model as unknown as OpenAIResponse['model'],
    status: 'completed',
    output_text: '',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    output: [],
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: 'auto',
    tools: [],
    top_p: null,
  } as OpenAIResponse;
}

function genId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${randomPart}`;
}
