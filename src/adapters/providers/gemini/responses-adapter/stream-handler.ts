import type {
  ResponseCompletedEvent,
  ResponseCreatedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseStreamEvent,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  Response as OpenAIResponse,
} from "openai/resources/responses/responses";
import type { StreamedPart } from "../client/fetch-client";

// ===== State Types =====

interface StreamState {
  responseId: string;
  model: string;
  created: number;
  sequenceNumber: number;
  outputIndex: number;
  contentIndex: number;
  isInitialized: boolean;
  currentTextItem: { id: string; text: string } | null;
  textBuffer: string;
  inCodeBlock: boolean;
  pendingEvents: ResponseStreamEvent[];
}

// ===== Action Types =====

type StreamAction =
  | { type: "INIT" }
  | { type: "TEXT"; text: string }
  | { type: "FUNCTION_CALL"; functionCall: { name?: string; args?: unknown } }
  | { type: "COMPLETE"; finishReason?: string };

// ===== Event Creators =====

const createResponseCreated = (state: StreamState): ResponseCreatedEvent => ({
  type: "response.created",
  response: {
    id: state.responseId,
    created_at: state.created,
    output_text: "",
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: state.model,
    object: "response",
    output: [],
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    status: "in_progress",
  },
  sequence_number: state.sequenceNumber++,
});

const createTextItemAdded = (state: StreamState, itemId: string): ResponseOutputItemAddedEvent => ({
  type: "response.output_item.added",
  sequence_number: state.sequenceNumber++,
  output_index: state.outputIndex++,
  item: {
    id: itemId,
    type: "message",
    role: "assistant",
    content: [],
    status: "completed",
  },
});

const createTextDelta = (state: StreamState, text: string): ResponseTextDeltaEvent => {
  const event: ResponseTextDeltaEvent = {
    type: "response.output_text.delta",
    delta: text,
    item_id: state.currentTextItem!.id,
    output_index: state.outputIndex - 1,
    content_index: state.contentIndex,
    logprobs: [],
    sequence_number: state.sequenceNumber++,
  };
  state.contentIndex += text.length;
  return event;
};

const createTextDone = (state: StreamState): ResponseTextDoneEvent => ({
  type: "response.output_text.done",
  item_id: state.currentTextItem!.id,
  output_index: state.outputIndex - 1,
  content_index: state.contentIndex,
  logprobs: [],
  sequence_number: state.sequenceNumber++,
  text: state.currentTextItem!.text,
});

const createTextItemDone = (state: StreamState): ResponseOutputItemDoneEvent => ({
  type: "response.output_item.done",
  sequence_number: state.sequenceNumber++,
  output_index: state.outputIndex - 1,
  item: {
    id: state.currentTextItem!.id,
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: state.currentTextItem!.text, annotations: [] }],
    status: "completed",
  },
});

const createFunctionCallAdded = (
  state: StreamState,
  itemId: string,
  functionCall: { name?: string; args?: unknown }
): ResponseOutputItemAddedEvent => ({
  type: "response.output_item.added",
  sequence_number: state.sequenceNumber++,
  output_index: state.outputIndex++,
  item: {
    id: itemId,
    type: "function_call",
    call_id: itemId,
    name: functionCall.name || "unknown_function",
    arguments: JSON.stringify(functionCall.args || {}),
  } as ResponseFunctionToolCall,
});

const createFunctionCallDone = (
  state: StreamState,
  itemId: string,
  functionCall: { name?: string; args?: unknown }
): ResponseOutputItemDoneEvent => ({
  type: "response.output_item.done",
  sequence_number: state.sequenceNumber++,
  output_index: state.outputIndex - 1,
  item: {
    id: itemId,
    type: "function_call",
    call_id: itemId,
    name: functionCall.name || "unknown_function",
    arguments: JSON.stringify(functionCall.args || {}),
  } as ResponseFunctionToolCall,
});

const createResponseCompleted = (state: StreamState, finishReason?: string): ResponseCompletedEvent => ({
  type: "response.completed",
  response: {
    id: state.responseId,
    created_at: state.created,
    output_text: state.currentTextItem?.text || "",
    error: null,
    incomplete_details: finishReason === "STOP" ? null : { reason: "max_output_tokens" },
    instructions: null,
    metadata: null,
    model: state.model,
    object: "response",
    output: [],
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    status: finishReason === "STOP" ? "completed" : "incomplete",
  },
  sequence_number: state.sequenceNumber++,
});

// ===== Helper Functions =====

const generateId = (prefix: string): string => {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${random}`;
};

const processTextBuffer = (state: StreamState): void => {
  const events: ResponseStreamEvent[] = [];
  let pos = 0;
  let lastEmitPos = 0;

  while (pos < state.textBuffer.length) {
    // Track code blocks
    if (state.textBuffer.substring(pos, pos + 3) === "```") {
      state.inCodeBlock = !state.inCodeBlock;
      pos += 3;
      continue;
    }

    // Split on \n\n outside code blocks
    if (
      !state.inCodeBlock &&
      pos + 1 < state.textBuffer.length &&
      state.textBuffer[pos] === "\n" &&
      state.textBuffer[pos + 1] === "\n"
    ) {
      // Emit text up to and including \n\n
      const chunk = state.textBuffer.substring(lastEmitPos, pos + 2);
      if (chunk) {
        events.push(createTextDelta(state, chunk));
      }
      lastEmitPos = pos + 2;
      pos += 2;
    } else {
      pos++;
    }
  }

  // Keep unprocessed text in buffer
  state.textBuffer = state.textBuffer.substring(lastEmitPos);
  state.pendingEvents = [...state.pendingEvents, ...events];
};

// ===== Reducer =====

const streamReducer = (state: StreamState, action: StreamAction): StreamState => {
  const newState = { ...state, pendingEvents: [] as ResponseStreamEvent[] };

  switch (action.type) {
    case "INIT": {
      newState.responseId = generateId("resp");
      newState.created = Math.floor(Date.now() / 1000);
      newState.isInitialized = true;
      newState.pendingEvents = [...newState.pendingEvents, createResponseCreated(newState)];
      break;
    }

    case "TEXT": {
      // Start text item if needed
      if (!newState.currentTextItem) {
        const itemId = generateId("msg");
        newState.currentTextItem = { id: itemId, text: "" };
        newState.pendingEvents = [...newState.pendingEvents, createTextItemAdded(newState, itemId)];
      }

      // Add to accumulated text and buffer
      newState.currentTextItem.text += action.text;
      newState.textBuffer += action.text;

      // Process buffer for paragraph breaks
      processTextBuffer(newState);
      break;
    }

    case "FUNCTION_CALL": {
      if (action.functionCall) {
        const itemId = generateId("fc");
        newState.pendingEvents = [
          ...newState.pendingEvents,
          createFunctionCallAdded(newState, itemId, action.functionCall),
          createFunctionCallDone(newState, itemId, action.functionCall),
        ];
      }
      break;
    }

    case "COMPLETE": {
      // Flush remaining text buffer
      if (newState.textBuffer && newState.currentTextItem) {
        newState.pendingEvents = [...newState.pendingEvents, createTextDelta(newState, newState.textBuffer)];
        newState.textBuffer = "";
      }

      // Close current text item
      if (newState.currentTextItem) {
        newState.pendingEvents = [...newState.pendingEvents, createTextDone(newState), createTextItemDone(newState)];
      }

      // Emit completion
      newState.pendingEvents = [...newState.pendingEvents, createResponseCompleted(newState, action.finishReason)];
      break;
    }
  }

  return newState;
};

// ===== Stream Handler Class =====

export class GeminiStreamHandler {
  private state: StreamState;

  constructor(model: string = "gemini-pro") {
    this.state = this.createInitialState(model);
  }

  private createInitialState(model: string): StreamState {
    return {
      responseId: "",
      model,
      created: 0,
      sequenceNumber: 1,
      outputIndex: 0,
      contentIndex: 0,
      isInitialized: false,
      currentTextItem: null,
      textBuffer: "",
      inCodeBlock: false,
      pendingEvents: [],
    };
  }

  async *handleStream(stream: AsyncIterable<StreamedPart>): AsyncGenerator<ResponseStreamEvent, void, unknown> {
    for await (const part of stream) {
      // Initialize on first part
      if (!this.state.isInitialized) {
        this.state = streamReducer(this.state, { type: "INIT" });
        yield* this.state.pendingEvents;
      }

      // Map part to action
      let action: StreamAction | null = null;
      switch (part.type) {
        case "text":
          if (part.text) {
            action = { type: "TEXT", text: part.text };
          }
          break;
        case "functionCall":
          action = { type: "FUNCTION_CALL", functionCall: part.functionCall || {} };
          break;
        case "complete":
          action = { type: "COMPLETE", finishReason: part.finishReason };
          break;
      }

      // Process action
      if (action) {
        this.state = streamReducer(this.state, action);
        yield* this.state.pendingEvents;
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState(this.state.model);
  }
}
