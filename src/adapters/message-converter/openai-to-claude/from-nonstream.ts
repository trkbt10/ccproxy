import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
  ResponseOutputItem,
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseCreatedEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseOutputItemAddedEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseOutputItemDoneEvent,
  ResponseCompletedEvent,
} from "openai/resources/responses/responses";
import type { Message as ClaudeMessage, ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { processOpenAIEvent } from "./event-reducer";
import type { ConversionState } from "./types";
import { isResponseOutputMessage, isResponseOutputText } from "../../providers/claude/guards";

// Local type guards for extended ResponseOutputItem variants
function isWebSearchCallItem(
  item: unknown
): item is { id?: string; type: "web_search_call"; status?: string; action?: { query?: string } } {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as { type?: unknown }).type === "web_search_call"
  );
}

function isImageGenerationCallItem(
  item: unknown
): item is { id?: string; type: "image_generation_call"; status?: string; prompt?: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as { type?: unknown }).type === "image_generation_call"
  );
}

function isCodeInterpreterCallItem(
  item: unknown
): item is { id?: string; type: "code_interpreter_call"; status?: string; code?: string; outputs?: unknown[] } {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as { type?: unknown }).type === "code_interpreter_call"
  );
}

function* toStreamEvents(resp: OpenAIResponse): Generator<ResponseStreamEvent> {
  const responseId = resp.id || `resp_${Date.now()}`;
  const createdAt = typeof resp.created_at === 'number' ? resp.created_at : Math.floor(Date.now() / 1000);

  // Emit a synthetic response.created (optional but helps state init parity)
  const created: ResponseCreatedEvent = {
    type: 'response.created',
    response: {
      id: responseId,
      created_at: createdAt,
      object: 'response',
      model: resp.model,
      output: [],
      output_text: resp.output_text ?? '',
      error: null,
      incomplete_details: resp.incomplete_details ?? null,
      instructions: null,
      metadata: null,
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: 'auto',
      tools: [],
      top_p: null,
      status: 'in_progress',
      usage: resp.usage,
    } as unknown as OpenAIResponse,
    sequence_number: 0,
  };
  yield created as ResponseStreamEvent;

  const items = Array.isArray(resp.output) ? (resp.output as ResponseOutputItem[]) : [];

  for (const item of items) {
    if (isResponseOutputMessage(item)) {
      const msg = item as ResponseOutputMessage;
      const textParts = (msg.content || []).filter((c): c is ResponseOutputText => isResponseOutputText(c));
      const text = textParts.map((p) => p.text).join("");
      if (text && text.length > 0) {
        const deltaEv: ResponseTextDeltaEvent = {
          type: 'response.output_text.delta',
          delta: text,
          item_id: `msg_${responseId}`,
          output_index: 0,
          content_index: 0,
          logprobs: [],
          sequence_number: 1,
        };
        yield deltaEv as ResponseStreamEvent;
        const doneEv: ResponseTextDoneEvent = {
          type: 'response.output_text.done',
          item_id: deltaEv.item_id,
          output_index: 0,
          content_index: 0,
          logprobs: [],
          text,
          sequence_number: 2,
        };
        yield doneEv as ResponseStreamEvent;
      }
    } else if (item && item.type === 'function_call') {
      const fc = item as ResponseFunctionToolCall & { id?: string };
      const id = fc.id || `fc_${responseId}`;
      const added: ResponseOutputItemAddedEvent = {
        type: 'response.output_item.added',
        item: ({ ...fc, id } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 3,
      };
      yield added as ResponseStreamEvent;

      if (typeof fc.arguments === 'string' && fc.arguments.length > 0) {
        const argsDelta: ResponseFunctionCallArgumentsDeltaEvent = {
          type: 'response.function_call_arguments.delta',
          item_id: id,
          output_index: 0,
          sequence_number: 4,
          delta: fc.arguments,
        };
        yield argsDelta as ResponseStreamEvent;
      }

      const done: ResponseOutputItemDoneEvent = {
        type: 'response.output_item.done',
        item: ({ ...fc, id } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 5,
      };
      yield done as ResponseStreamEvent;
    } else if (isWebSearchCallItem(item)) {
      const id = item.id || `ws_${responseId}`;
      const added: ResponseOutputItemAddedEvent = {
        type: 'response.output_item.added',
        item: ({ id, type: 'web_search_call', status: item.status || 'completed', action: item.action } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 10,
      };
      yield added as ResponseStreamEvent;
      const done: ResponseOutputItemDoneEvent = {
        type: 'response.output_item.done',
        item: ({ id, type: 'web_search_call', status: item.status || 'completed', action: item.action } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 11,
      };
      yield done as ResponseStreamEvent;
    } else if (isImageGenerationCallItem(item)) {
      const id = item.id || `img_${responseId}`;
      const added: ResponseOutputItemAddedEvent = {
        type: 'response.output_item.added',
        item: ({ id, type: 'image_generation_call', status: item.status || 'completed', prompt: item.prompt } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 20,
      };
      yield added as ResponseStreamEvent;
      const done: ResponseOutputItemDoneEvent = {
        type: 'response.output_item.done',
        item: ({ id, type: 'image_generation_call', status: item.status || 'completed', prompt: item.prompt } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 21,
      };
      yield done as ResponseStreamEvent;
    } else if (isCodeInterpreterCallItem(item)) {
      const id = item.id || `code_${responseId}`;
      const added: ResponseOutputItemAddedEvent = {
        type: 'response.output_item.added',
        item: ({ id, type: 'code_interpreter_call', status: item.status || 'completed' } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 30,
      };
      yield added as ResponseStreamEvent;
      // Optionally emit code delta/done if code is present
      if (typeof item.code === 'string' && item.code.length > 0) {
        const codeDelta: ResponseFunctionCallArgumentsDeltaEvent = {
          type: 'response.function_call_arguments.delta',
          item_id: id,
          output_index: 0,
          sequence_number: 31,
          delta: JSON.stringify({ code: item.code }),
        };
        yield codeDelta as ResponseStreamEvent;
      }
      const done: ResponseOutputItemDoneEvent = {
        type: 'response.output_item.done',
        item: ({ id, type: 'code_interpreter_call', status: item.status || 'completed', code: item.code, outputs: item.outputs } as unknown) as ResponseOutputItem,
        output_index: 0,
        sequence_number: 32,
      };
      yield done as ResponseStreamEvent;
    }
  }

  const completed: ResponseCompletedEvent = {
    type: 'response.completed',
    response: resp,
    sequence_number: 6,
  };
  yield completed as ResponseStreamEvent;
}

function buildClaudeMessageFromState(state: ConversionState, model: string, messageId: string, resp: OpenAIResponse): ClaudeMessage {
  const content: ContentBlock[] = [];
  // Preserve insertion order by index
  const blocks = Array.from(state.contentBlocks.values()).sort((a, b) => a.index - b.index);
  for (const b of blocks) {
    if (b.type === 'text' && b.content) {
      content.push({ type: 'text', text: b.content, citations: [] });
    } else if (b.type === 'tool_use') {
      let input: unknown = {};
      try {
        input = b.content ? JSON.parse(b.content) : {};
      } catch {
        input = {};
      }
      content.push({ type: 'tool_use', id: b.id, name: b.name || '', input });
    }
  }

  const hasTools = content.some((c) => c.type === 'tool_use');
  const stop_reason = (resp.status === 'incomplete' && resp.incomplete_details?.reason === 'max_output_tokens')
    ? 'max_tokens'
    : (hasTools ? 'tool_use' : 'end_turn');
  const usage = resp.usage || { input_tokens: 0, output_tokens: 0 };

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 },
  } as ClaudeMessage;
}

export function openAINonStreamToClaudeMessage(resp: OpenAIResponse, messageId: string, model: string): ClaudeMessage {
  let state: ConversionState = {
    messageId,
    contentBlocks: new Map(),
    currentIndex: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  for (const ev of toStreamEvents(resp)) {
    const result = processOpenAIEvent(state, ev);
    state = result.state;
  }
  return buildClaudeMessageFromState(state, model, messageId, resp);
}
