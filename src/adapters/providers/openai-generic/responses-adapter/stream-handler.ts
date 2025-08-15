import type {
  ResponseCreatedEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseCompletedEvent,
} from "openai/resources/responses/responses";
import type {
  ResponseStreamEvent,
  ChatCompletionChunk,
  OpenAIResponse,
  ResponseOutputItem,
  ResponseFunctionToolCall,
  ChatCompletionMessageToolCall,
} from "./types";

export class StreamHandler {
  private responseId: string | undefined;
  private model: string | undefined;
  private created: number | undefined;
  private currentFunctionItemId: string | undefined;
  private currentFunctionCallId: string | undefined;
  private textItemId: string | undefined;
  private sequenceNumber = 0;
  private outputIndex = 0;
  private contentIndex = 0;
  private accumulatedText = "";

  constructor() {}

  async *handleStream(
    stream: AsyncIterable<ChatCompletionChunk>
  ): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    for await (const chunk of stream) {
      yield* this.processChunk(chunk);
    }
  }

  private *processChunk(chunk: ChatCompletionChunk): Generator<ResponseStreamEvent, void, unknown> {
    if (!this.responseId) {
      this.initializeMetadata(chunk);
      const response: OpenAIResponse = {
        id: this.responseId!,
        created_at: this.created!,
        output_text: "",
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: null,
        model: (this.model || "unknown"),
        object: "response",
        output: [],
        parallel_tool_calls: true,
        temperature: null,
        tool_choice: "auto",
        tools: [],
        top_p: null,
        status: "in_progress",
      };
      const created: ResponseCreatedEvent = { type: 'response.created', response, sequence_number: this.nextSeq() };
      yield created as ResponseStreamEvent;
    }

    const delta = chunk.choices[0]?.delta;
    if (!delta) return;

    if (typeof delta.content === "string" && delta.content.length > 0) {
      if (!this.textItemId) this.textItemId = this.generateId('msg');
      const deltaEv: ResponseTextDeltaEvent = {
        type: 'response.output_text.delta',
        delta: delta.content,
        item_id: this.textItemId,
        output_index: this.outputIndex,
        content_index: this.contentIndex,
        logprobs: [],
        sequence_number: this.nextSeq(),
      };
      this.accumulatedText += delta.content;
      yield deltaEv as ResponseStreamEvent;
    }

    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      yield* this.handleToolCallsDelta(delta.tool_calls as Array<ChatCompletionMessageToolCall>);
    }

    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason) {
      if (this.currentFunctionItemId) {
        const doneItem: ResponseOutputItem = ({
          type: 'function_call',
          id: this.currentFunctionItemId!,
          name: '',
          call_id: this.currentFunctionCallId!,
          arguments: '',
        } as ResponseFunctionToolCall & { id: string }) as ResponseOutputItem;
        const doneEv: ResponseOutputItemDoneEvent = {
          type: 'response.output_item.done',
          item: doneItem,
          output_index: this.outputIndex,
          sequence_number: this.nextSeq(),
        };
        yield doneEv as ResponseStreamEvent;
        this.currentFunctionItemId = undefined;
        this.currentFunctionCallId = undefined;
      }
      if (this.textItemId) {
        const textDone: ResponseTextDoneEvent = {
          type: 'response.output_text.done',
          item_id: this.textItemId,
          output_index: this.outputIndex,
          content_index: this.contentIndex,
          logprobs: [],
          sequence_number: this.nextSeq(),
          text: this.accumulatedText,
        };
        yield textDone as ResponseStreamEvent;
      }
      const finalResponse: OpenAIResponse = {
        id: this.responseId!,
        created_at: this.created!,
        output_text: this.accumulatedText,
        error: null,
        incomplete_details: finishReason === 'length' ? { reason: 'max_output_tokens' } : null,
        instructions: null,
        metadata: null,
        model: (this.model || 'unknown'),
        object: 'response',
        output: [],
        parallel_tool_calls: true,
        temperature: null,
        tool_choice: 'auto',
        tools: [],
        top_p: null,
        status: finishReason === 'length' ? 'incomplete' : 'completed',
      };
      const completed: ResponseCompletedEvent = {
        type: 'response.completed',
        response: finalResponse,
        sequence_number: this.nextSeq(),
      };
      yield completed as ResponseStreamEvent;
    }
  }

  private initializeMetadata(chunk: ChatCompletionChunk): void {
    this.responseId = chunk.id;
    this.model = chunk.model;
    this.created = chunk.created;
  }

  private *handleToolCallsDelta(toolCallDeltas: Array<ChatCompletionMessageToolCall>): Generator<ResponseStreamEvent, void, unknown> {
    for (const t of toolCallDeltas) {
      if (t.id && (!this.currentFunctionCallId || this.currentFunctionCallId !== t.id)) {
        if (this.currentFunctionItemId) {
        const doneItem: ResponseOutputItem = ({
          type: 'function_call',
          id: this.currentFunctionItemId!,
          name: '',
          call_id: this.currentFunctionCallId!,
          arguments: '',
        } as ResponseFunctionToolCall & { id: string }) as ResponseOutputItem;
          const doneEv: ResponseOutputItemDoneEvent = {
            type: 'response.output_item.done',
            item: doneItem,
            output_index: this.outputIndex,
            sequence_number: this.nextSeq(),
          };
          yield doneEv as ResponseStreamEvent;
        }
        this.currentFunctionCallId = t.id;
        this.currentFunctionItemId = this.generateId('fc');
        const name = t.type === 'function' ? (t.function?.name ?? '') : '';
        const args = t.type === 'function' ? (t.function?.arguments ?? '') : '';
        const item: ResponseFunctionToolCall & { id: string } = {
          type: 'function_call',
          id: this.currentFunctionItemId,
          name,
          call_id: t.id,
          arguments: args,
        };
        const addedEv: ResponseOutputItemAddedEvent = {
          type: 'response.output_item.added',
          item: item as ResponseOutputItem,
          output_index: this.outputIndex,
          sequence_number: this.nextSeq(),
        };
        yield addedEv as ResponseStreamEvent;
      }
      const args = t.type === 'function' ? t.function?.arguments : undefined;
      if (typeof args === 'string' && args.length > 0 && this.currentFunctionItemId) {
        const argsEv: ResponseFunctionCallArgumentsDeltaEvent = {
          type: 'response.function_call_arguments.delta',
          item_id: this.currentFunctionItemId,
          output_index: this.outputIndex,
          sequence_number: this.nextSeq(),
          delta: args,
        };
        yield argsEv as ResponseStreamEvent;
      }
    }
  }

  private generateId(prefix: string): string {
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${randomPart}`;
  }

  private nextSeq(): number {
    this.sequenceNumber += 1;
    return this.sequenceNumber;
  }

  reset(): void {
    this.responseId = undefined;
    this.model = undefined;
    this.created = undefined;
    this.currentFunctionItemId = undefined;
    this.currentFunctionCallId = undefined;
    this.textItemId = undefined;
    this.sequenceNumber = 0;
    this.outputIndex = 0;
    this.contentIndex = 0;
    this.accumulatedText = "";
  }
}

