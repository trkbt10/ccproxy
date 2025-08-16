import type {
  ResponseCompletedEvent,
  ResponseCreatedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
} from "openai/resources/responses/responses";
import type {
  OpenAIResponse,
  ResponseOutputItem,
  ResponseStreamEvent,
} from "../../openai-generic/responses-adapter/types";
import type { StreamedPart } from "../client/fetch-client";
import { type MarkdownElementType, type MarkdownParseEvent, StreamingMarkdownParser } from "./markdown-parser";

// Specific output item types with proper interface extensions
interface FunctionCallItem {
  id: string;
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
  status: "completed";
}

interface CodeInterpreterCallItem {
  id: string;
  type: "code_interpreter_call";
  status: "completed" | "in_progress" | "failed";
  code: string;
  container_id: string;
  outputs: Array<{ type: "logs"; logs: string }>;
}

export class GeminiStreamHandler {
  private responseId: string | undefined;
  private model: string | undefined;
  private created: number | undefined;
  private textItemId: string | undefined;
  private sequenceNumber = 0;
  private outputIndex = 0;
  private contentIndex = 0;
  private accumulatedText = "";
  private textBuffer = ""; // Buffer for paragraph processing
  private inCodeBlock = false;
  private codeBlockDepth = 0;
  private markdownParser = new StreamingMarkdownParser();
  private isInitialized = false;
  private activeMarkdownItems = new Map<string, { itemId: string; outputItem: CodeInterpreterCallItem }>();

  constructor() {}

  async *handleStream(
    stream: AsyncIterable<StreamedPart>
  ): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    for await (const part of stream) {
      yield* this.processPart(part);
    }
  }

  private async *processPart(part: StreamedPart): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    // Initialize response on first part
    if (!this.isInitialized) {
      this.initializeResponse();
      const response: OpenAIResponse = {
        id: this.responseId!,
        created_at: this.created!,
        output_text: "",
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: null,
        model: this.model || "gemini-unknown",
        object: "response",
        output: [],
        parallel_tool_calls: true,
        temperature: null,
        tool_choice: "auto",
        tools: [],
        top_p: null,
        status: "in_progress",
      };
      
      const created: ResponseCreatedEvent = {
        type: 'response.created',
        response,
        sequence_number: this.nextSeq()
      };
      yield created as ResponseStreamEvent;
      this.isInitialized = true;
    }

    if (part.type === "text" && part.text) {
      yield* this.handleTextPart(part.text);
    } else if (part.type === "functionCall") {
      yield* this.handleFunctionCall(part.functionCall);
    } else if (part.type === "complete") {
      yield* this.handleCompletion(part);
    }
  }

  private async *handleTextPart(text: string): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    // First time receiving text, emit output_item.added
    if (!this.textItemId) {
      yield* this.emitTextItemAdded();
    }
    
    this.accumulatedText += text;
    this.textBuffer += text;
    
    // Process buffered text to emit complete blocks
    yield* this.processTextBuffer();
    
    // Also process markdown events for special handling (only code blocks create items)
    for await (const parseEvent of this.markdownParser.processChunk(text)) {
      yield* this.handleMarkdownEvent(parseEvent);
    }
  }

  private async *processTextBuffer(): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    // Track if we're in a code block
    let pos = 0;
    let lastEmitPos = 0;
    
    while (pos < this.textBuffer.length) {
      // Check for code block markers
      if (this.textBuffer.substring(pos, pos + 3) === '```') {
        // Toggle code block state
        this.inCodeBlock = !this.inCodeBlock;
        pos += 3;
        continue;
      }
      
      // Only look for \n\n outside of code blocks
      if (!this.inCodeBlock && 
          pos + 1 < this.textBuffer.length &&
          this.textBuffer[pos] === '\n' && 
          this.textBuffer[pos + 1] === '\n') {
        
        // Found paragraph break - emit everything up to and including \n\n
        const blockText = this.textBuffer.substring(lastEmitPos, pos + 2);
        if (blockText) {
          yield* this.emitTextDelta(blockText);
        }
        
        lastEmitPos = pos + 2;
        pos += 2;
      } else {
        pos++;
      }
    }
    
    // Keep unprocessed text in buffer
    this.textBuffer = this.textBuffer.substring(lastEmitPos);
  }


  private async *emitTextItemAdded(): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    this.textItemId = this.generateId('msg');
    
    const textItem: ResponseOutputItem = {
      id: this.textItemId,
      type: 'output_text',
      text: '',
      logprobs: []
    };
    
    const addedEvent: ResponseOutputItemAddedEvent = {
      type: 'response.output_item.added',
      sequence_number: this.nextSeq(),
      output_index: this.outputIndex++,
      item: textItem,
    };
    yield addedEvent as ResponseStreamEvent;
  }

  private async *emitTextDelta(text: string): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    const deltaEv: ResponseTextDeltaEvent = {
      type: 'response.output_text.delta',
      delta: text,
      item_id: this.textItemId!,
      output_index: this.outputIndex - 1, // Use the index from the added event
      content_index: this.contentIndex,
      logprobs: [],
      sequence_number: this.nextSeq(),
    };
    
    yield deltaEv as ResponseStreamEvent;
    this.contentIndex += text.length;
  }

  private async *handleMarkdownEvent(event: MarkdownParseEvent): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    switch (event.type) {
      case 'begin':
        yield* this.handleMarkdownBegin(event);
        break;
      case 'delta':
        yield* this.handleMarkdownDelta(event);
        break;
      case 'end':
        yield* this.handleMarkdownEnd(event);
        break;
    }
  }

  private async *handleMarkdownBegin(event: MarkdownParseEvent & { type: 'begin' }): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    const itemId = this.generateId(this.getItemPrefix(event.elementType));
    const outputItem = this.createOutputItem(itemId, event.elementType, event.metadata);
    
    if (outputItem) {
      this.activeMarkdownItems.set(event.elementId, { itemId, outputItem });
      
      const addedEvent: ResponseOutputItemAddedEvent = {
        type: 'response.output_item.added',
        sequence_number: this.nextSeq(),
        output_index: this.outputIndex++,
        item: outputItem,
      };
      yield addedEvent as ResponseStreamEvent;
    }
    // If outputItem is null, the markdown element will be handled as regular text
  }

  private async *handleMarkdownDelta(event: MarkdownParseEvent & { type: 'delta' }): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    const activeItem = this.activeMarkdownItems.get(event.elementId);
    if (!activeItem) return;

    // For code interpreter, we can emit code deltas
    if (activeItem.outputItem.type === 'code_interpreter_call') {
      // Could emit code interpreter deltas here if needed
      // For now, we'll accumulate and emit at the end
    }
  }

  private async *handleMarkdownEnd(event: MarkdownParseEvent & { type: 'end' }): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    const activeItem = this.activeMarkdownItems.get(event.elementId);
    if (!activeItem) return;

    // Update the output item with final content
    const finalOutputItem = this.updateOutputItemWithFinalContent(activeItem.outputItem, event.finalContent);
    
    const doneEvent: ResponseOutputItemDoneEvent = {
      type: 'response.output_item.done',
      sequence_number: this.nextSeq(),
      output_index: this.outputIndex - 1,
      item: finalOutputItem,
    };
    yield doneEvent as ResponseStreamEvent;
    
    this.activeMarkdownItems.delete(event.elementId);
  }

  private async *handleFunctionCall(functionCall: { name?: string; args?: unknown }): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    // Handle function calls - this is different from markdown elements
    const itemId = this.generateId('fc');
    
    const functionItem: FunctionCallItem = {
      id: itemId,
      type: 'function_call',
      call_id: this.generateId('call'),
      name: functionCall.name || 'unknown_function',
      arguments: JSON.stringify(functionCall.args || {}),
      status: 'completed'
    };

    const addedEvent: ResponseOutputItemAddedEvent = {
      type: 'response.output_item.added',
      sequence_number: this.nextSeq(),
      output_index: this.outputIndex++,
      item: functionItem,
    };
    yield addedEvent as ResponseStreamEvent;

    const doneEvent: ResponseOutputItemDoneEvent = {
      type: 'response.output_item.done',
      sequence_number: this.nextSeq(),
      output_index: this.outputIndex - 1,
      item: functionItem,
    };
    yield doneEvent as ResponseStreamEvent;
  }

  private getItemPrefix(elementType: MarkdownElementType): string {
    switch (elementType) {
      case 'code': return 'ci'; // code_interpreter_call
      default: return 'txt'; // text - not a special item type
    }
  }
  
  private createOutputItem(itemId: string, elementType: MarkdownElementType, metadata?: { language?: string; level?: number }): CodeInterpreterCallItem | null {
    switch (elementType) {
      case 'code':
        const codeItem: CodeInterpreterCallItem = {
          id: itemId,
          type: 'code_interpreter_call',
          status: 'in_progress', // Will be updated to completed in handleMarkdownEnd
          code: '', // Will be filled in handleMarkdownEnd
          container_id: this.generateId('cntr'),
          outputs: [{
            type: 'logs',
            logs: `Code block (${metadata?.language || 'text'})`
          }]
        };
        return codeItem;
        
      default:
        // Other markdown elements (headers, quotes, lists, etc.) should be treated as regular text
        // Not as special output items
        return null;
    }
  }

  private updateOutputItemWithFinalContent(outputItem: CodeInterpreterCallItem, finalContent: string): CodeInterpreterCallItem {
    if (outputItem.type === 'code_interpreter_call') {
      return {
        ...outputItem,
        status: 'completed',
        code: finalContent
      } as CodeInterpreterCallItem;
    }
    
    return outputItem;
  }

  private async *handleCompletion(part: StreamedPart): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    // Flush any remaining text in buffer
    if (this.textBuffer && this.textItemId) {
      yield* this.emitTextDelta(this.textBuffer);
      this.textBuffer = '';
    }
    
    // Send text done event if we have text content
    if (this.textItemId) {
      const textDone: ResponseTextDoneEvent = {
        type: 'response.output_text.done',
        item_id: this.textItemId,
        output_index: this.outputIndex - 1,
        content_index: this.contentIndex,
        logprobs: [],
        sequence_number: this.nextSeq(),
        text: this.accumulatedText,
      };
      yield textDone as ResponseStreamEvent;
      
      // Also emit output_item.done
      const textItem: ResponseOutputItem = {
        id: this.textItemId,
        type: 'output_text',
        text: this.accumulatedText,
        logprobs: []
      };
      
      const itemDone: ResponseOutputItemDoneEvent = {
        type: 'response.output_item.done',
        sequence_number: this.nextSeq(),
        output_index: this.outputIndex - 1,
        item: textItem,
      };
      yield itemDone as ResponseStreamEvent;
    }

    // Send final response
    const finalResponse: OpenAIResponse = {
      id: this.responseId!,
      created_at: this.created!,
      output_text: this.accumulatedText,
      error: null,
      incomplete_details: part.finishReason === 'STOP' ? null : { reason: 'max_output_tokens' },
      instructions: null,
      metadata: null,
      model: this.model || 'gemini-unknown',
      object: 'response',
      output: [],
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: 'auto',
      tools: [],
      top_p: null,
      status: part.finishReason === 'STOP' ? 'completed' : 'incomplete',
    };

    const completed: ResponseCompletedEvent = {
      type: 'response.completed',
      response: finalResponse,
      sequence_number: this.nextSeq(),
    };
    yield completed as ResponseStreamEvent;
  }

  private initializeResponse(): void {
    this.responseId = this.generateId('resp');
    this.model = 'gemini-pro'; // Could be passed in constructor
    this.created = Math.floor(Date.now() / 1000);
  }

  private generateId(prefix: string): string {
    const randomPart = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now().toString(36);
    return `${prefix}_${timestamp}_${randomPart}`;
  }

  private nextSeq(): number {
    this.sequenceNumber += 1;
    return this.sequenceNumber;
  }

  reset(): void {
    this.responseId = undefined;
    this.model = undefined;
    this.created = undefined;
    this.textItemId = undefined;
    this.sequenceNumber = 0;
    this.outputIndex = 0;
    this.contentIndex = 0;
    this.accumulatedText = "";
    this.textBuffer = "";
    this.inCodeBlock = false;
    this.codeBlockDepth = 0;
    this.markdownParser.reset();
    this.isInitialized = false;
    this.activeMarkdownItems.clear();
    this.annotationIndex = 0;
    this.textStartIndex = 0;
  }

  private async *handleAnnotation(event: MarkdownParseEvent & { type: 'annotation' }): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    if (!this.textItemId) return;
    
    // Calculate the actual position in the accumulated text
    const adjustedStartIndex = this.textStartIndex + event.annotation.start_index;
    const adjustedEndIndex = this.textStartIndex + event.annotation.end_index;
    
    const annotationEvent: ResponseOutputTextAnnotationAddedEvent = {
      type: 'response.output_text.annotation.added',
      sequence_number: this.nextSeq(),
      item_id: this.textItemId,
      output_index: this.outputIndex - 1,
      content_index: 0, // Content index is typically 0 for single text content
      annotation_index: this.annotationIndex++,
      annotation: {
        type: event.annotation.type,
        url: event.annotation.url,
        title: event.annotation.title,
        start_index: adjustedStartIndex,
        end_index: adjustedEndIndex
      }
    };
    
    yield annotationEvent as ResponseStreamEvent;
  }
}