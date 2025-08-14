import type {
  MessageStreamEvent,
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
} from "@anthropic-ai/sdk/resources/messages";
import type { 
  ResponseStreamEvent,
  ResponseImageGenCallGeneratingEvent,
  ResponseImageGenCallPartialImageEvent,
  ResponseImageGenCallCompletedEvent,
  ResponseImageGenCallInProgressEvent,
  ResponseCodeInterpreterCallInProgressEvent,
  ResponseCodeInterpreterCallCodeDeltaEvent,
  ResponseCodeInterpreterCallCodeDoneEvent,
  ResponseCodeInterpreterCallInterpretingEvent,
  ResponseCodeInterpreterCallCompletedEvent,
  ResponseWebSearchCallInProgressEvent,
  ResponseWebSearchCallSearchingEvent,
  ResponseWebSearchCallCompletedEvent
} from "openai/resources/responses/responses";

// Type guards for each Claude event type
export function isMessageStartEvent(event: MessageStreamEvent): event is MessageStartEvent {
  return event.type === "message_start";
}

export function isContentBlockStartEvent(event: MessageStreamEvent): event is ContentBlockStartEvent {
  return event.type === "content_block_start";
}

export function isContentBlockDeltaEvent(event: MessageStreamEvent): event is ContentBlockDeltaEvent {
  return event.type === "content_block_delta";
}

export function isContentBlockStopEvent(event: MessageStreamEvent): event is ContentBlockStopEvent {
  return event.type === "content_block_stop";
}

export function isMessageDeltaEvent(event: MessageStreamEvent): event is MessageDeltaEvent {
  return event.type === "message_delta";
}

export function isMessageStopEvent(event: MessageStreamEvent): event is MessageStopEvent {
  return event.type === "message_stop";
}

// Validator functions for each event type
export const eventValidators = {
  message_start: (event: MessageStartEvent) => {
    return (
      event.message &&
      event.message.type === "message" &&
      typeof event.message.id === "string" &&
      event.message.role === "assistant"
    );
  },
  
  content_block_start: (event: ContentBlockStartEvent) => {
    const isValidBase = (
      typeof event.index === "number" &&
      event.content_block &&
      event.content_block.type &&
      ["text", "tool_use"].includes(event.content_block.type)
    );
    
    // Additional validation for tool_use blocks
    if (isValidBase && event.content_block.type === "tool_use") {
      return event.content_block.id && event.content_block.id.startsWith("toolu_");
    }
    
    return isValidBase;
  },
  
  content_block_delta: (event: ContentBlockDeltaEvent) => {
    return (
      typeof event.index === "number" &&
      event.delta &&
      event.delta.type &&
      ["text_delta", "input_json_delta"].includes(event.delta.type)
    );
  },
  
  content_block_stop: (event: ContentBlockStopEvent) => {
    return typeof event.index === "number";
  },
  
  message_delta: (event: MessageDeltaEvent) => {
    return (
      event.delta &&
      typeof event.delta.stop_reason === "string"
    );
  },
  
  message_stop: (event: MessageStopEvent) => {
    return event.type === "message_stop";
  },
} as const;

// Get all valid Claude event types
export const validClaudeEventTypes = Object.keys(eventValidators) as Array<keyof typeof eventValidators>;

// Validate any Claude event
export function validateClaudeEvent(event: MessageStreamEvent): boolean {
  switch (event.type) {
    case "message_start":
      return eventValidators.message_start(event);
    case "content_block_start":
      return !!eventValidators.content_block_start(event);
    case "content_block_delta":
      return eventValidators.content_block_delta(event);
    case "content_block_stop":
      return eventValidators.content_block_stop(event);
    case "message_delta":
      return eventValidators.message_delta(event);
    case "message_stop":
      return eventValidators.message_stop(event);
    default:
      return false;
  }
}

// Type guards for OpenAI image generation events
export function isImageGenerationGeneratingEvent(event: ResponseStreamEvent): event is ResponseImageGenCallGeneratingEvent {
  return event.type === "response.image_generation_call.generating";
}

export function isImageGenerationPartialImageEvent(event: ResponseStreamEvent): event is ResponseImageGenCallPartialImageEvent {
  return event.type === "response.image_generation_call.partial_image";
}

export function isImageGenerationCompletedEvent(event: ResponseStreamEvent): event is ResponseImageGenCallCompletedEvent {
  return event.type === "response.image_generation_call.completed";
}

export function isImageGenerationInProgressEvent(event: ResponseStreamEvent): event is ResponseImageGenCallInProgressEvent {
  return event.type === "response.image_generation_call.in_progress";
}

// Type guards for OpenAI code interpreter events
export function isCodeInterpreterInProgressEvent(event: ResponseStreamEvent): event is ResponseCodeInterpreterCallInProgressEvent {
  return event.type === "response.code_interpreter_call.in_progress";
}

export function isCodeInterpreterCodeDeltaEvent(event: ResponseStreamEvent): event is ResponseCodeInterpreterCallCodeDeltaEvent {
  return event.type === "response.code_interpreter_call_code.delta";
}

export function isCodeInterpreterCodeDoneEvent(event: ResponseStreamEvent): event is ResponseCodeInterpreterCallCodeDoneEvent {
  return event.type === "response.code_interpreter_call_code.done";
}

export function isCodeInterpreterInterpretingEvent(event: ResponseStreamEvent): event is ResponseCodeInterpreterCallInterpretingEvent {
  return event.type === "response.code_interpreter_call.interpreting";
}

export function isCodeInterpreterCompletedEvent(event: ResponseStreamEvent): event is ResponseCodeInterpreterCallCompletedEvent {
  return event.type === "response.code_interpreter_call.completed";
}

// Type guards for OpenAI web search events
export function isWebSearchInProgressEvent(event: ResponseStreamEvent): event is ResponseWebSearchCallInProgressEvent {
  return event.type === "response.web_search_call.in_progress";
}

export function isWebSearchSearchingEvent(event: ResponseStreamEvent): event is ResponseWebSearchCallSearchingEvent {
  return event.type === "response.web_search_call.searching";
}

export function isWebSearchCompletedEvent(event: ResponseStreamEvent): event is ResponseWebSearchCallCompletedEvent {
  return event.type === "response.web_search_call.completed";
}