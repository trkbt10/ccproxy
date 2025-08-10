import type { 
  OpenAIResponse,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  ResponseOutputText,
  ResponseStreamEvent,
  ChatCompletionChunk,
  StreamChunkData,
  ToolCall
} from "./types";

export class StreamHandler {
  private callIdMapping: Map<string, string>;
  private responseId: string | undefined;
  private model: string | undefined;
  private created: number | undefined;
  private accumulatedContent: string = "";
  private currentToolCall: ToolCall | undefined;
  private inputTokens: number = 0;
  private outputTokens: number = 0;

  constructor(callIdMapping: Map<string, string>) {
    this.callIdMapping = callIdMapping;
  }

  async *handleStream(
    stream: AsyncIterable<ChatCompletionChunk>
  ): AsyncGenerator<OpenAIResponse, void, unknown> {
    for await (const chunk of stream) {
      yield* this.processChunk(chunk);
    }
  }

  private *processChunk(chunk: ChatCompletionChunk): Generator<OpenAIResponse, void, unknown> {
    // Initialize metadata on first chunk
    if (!this.responseId) {
      this.initializeMetadata(chunk);
    }

    // Update token counts if available
    this.updateTokenCounts(chunk);

    const delta = chunk.choices[0]?.delta;
    if (!delta) return;

    // Handle content delta
    if (delta.content) {
      yield* this.handleContentDelta(delta.content);
    }

    // Handle tool calls
    if (delta.tool_calls) {
      yield* this.handleToolCallsDelta(delta.tool_calls);
    }

    // Handle finish reason
    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason) {
      yield* this.handleFinish(finishReason);
    }
  }

  private initializeMetadata(chunk: ChatCompletionChunk): void {
    this.responseId = chunk.id;
    this.model = chunk.model;
    this.created = chunk.created;
  }

  private updateTokenCounts(chunk: ChatCompletionChunk): void {
    if (chunk.usage) {
      this.inputTokens = chunk.usage.prompt_tokens ?? this.inputTokens;
      this.outputTokens = chunk.usage.completion_tokens ?? this.outputTokens;
    }
  }

  private *handleContentDelta(content: string): Generator<OpenAIResponse, void, unknown> {
    this.accumulatedContent += content;
    
    const textOutput: ResponseOutputText = {
      type: "output_text",
      text: content,
      annotations: [],
    };

    const messageOutput: ResponseOutputMessage = {
      type: "message",
      id: this.generateId("msg"),
      content: [textOutput],
      role: "assistant",
      status: "completed",
    };

    yield this.createResponse([messageOutput], "completed");
  }

  private *handleToolCallsDelta(
    toolCallDeltas: Array<any>
  ): Generator<OpenAIResponse, void, unknown> {
    for (const toolCallDelta of toolCallDeltas) {
      if (toolCallDelta.id) {
        // Start of a new tool call
        if (this.currentToolCall) {
          // Yield the previous tool call
          yield this.createToolCallResponse(this.currentToolCall);
        }

        const toolUseId = this.generateId("toolu");
        this.callIdMapping.set(toolCallDelta.id, toolUseId);

        this.currentToolCall = {
          id: toolUseId,
          call_id: toolCallDelta.id,
          name: toolCallDelta.function?.name ?? "",
          arguments: toolCallDelta.function?.arguments ?? "",
        };
      } else if (this.currentToolCall && toolCallDelta.function) {
        // Accumulate tool call data
        if (toolCallDelta.function.name) {
          this.currentToolCall.name += toolCallDelta.function.name;
        }
        if (toolCallDelta.function.arguments) {
          this.currentToolCall.arguments += toolCallDelta.function.arguments;
        }
      }
    }
  }

  private *handleFinish(finishReason: string): Generator<OpenAIResponse, void, unknown> {
    // Yield any pending tool call
    if (this.currentToolCall) {
      yield this.createToolCallResponse(this.currentToolCall);
      this.currentToolCall = undefined;
    }

    // Determine final status
    const status = finishReason === "length" ? "incomplete" : "completed";
    const incompleteDetails = finishReason === "length" 
      ? { reason: "max_output_tokens" as const } 
      : undefined;

    // Send final response with status
    yield this.createResponse([], status, incompleteDetails);
  }

  private createResponse(
    output: ResponseOutputItem[],
    status: "completed" | "incomplete",
    incompleteDetails?: { reason: "max_output_tokens" }
  ): OpenAIResponse {
    // Build the text content from output items
    const outputText = output
      .filter(item => item.type === "message")
      .map(item => {
        const msgItem = item as ResponseOutputMessage;
        return msgItem.content
          .filter(c => 'text' in c)
          .map(c => (c as ResponseOutputText).text)
          .join("");
      })
      .join("");

    return {
      id: this.responseId!,
      object: "response",
      model: (this.model ?? "unknown") as unknown as OpenAIResponse["model"],
      created_at: this.created!,
      output_text: outputText,
      error: null,
      incomplete_details: incompleteDetails ?? null,
      instructions: null,
      metadata: null,
      output,
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: "auto",
      tools: [],
      top_p: null,
      usage: {
        input_tokens: this.inputTokens,
        output_tokens: this.outputTokens,
        total_tokens: this.inputTokens + this.outputTokens,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens_details: {
          reasoning_tokens: 0,
        },
      },
      status,
    };
  }

  private createToolCallResponse(toolCall: ToolCall): OpenAIResponse {
    const functionCall: ResponseFunctionToolCall = {
      type: "function_call",
      id: toolCall.id,
      call_id: toolCall.call_id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    };

    return this.createResponse([functionCall], "completed");
  }

  private generateId(prefix: string): string {
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${randomPart}`;
  }

  reset(): void {
    this.responseId = undefined;
    this.model = undefined;
    this.created = undefined;
    this.accumulatedContent = "";
    this.currentToolCall = undefined;
    this.inputTokens = 0;
    this.outputTokens = 0;
  }
}
