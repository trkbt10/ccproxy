import type { 
  ResponseStreamEvent,
  ResponseItem,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem,
  ResponseOutputText,
  ResponseTextDeltaEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
  ResponseCreatedEvent,
  ResponseCompletedEvent,
  ResponseInProgressEvent,
  ResponseFailedEvent,
  ResponseIncompleteEvent,
  ResponseReasoningItem,
  ResponseFunctionWebSearch,
  ResponseCodeInterpreterToolCall,
  ResponseFunctionToolCallItem
} from "openai/resources/responses/responses";
import { isMessageOutput, isFunctionCallOutput, isResponseItemCompatible } from "./type-guards";

interface ToolCallInProgress {
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: "in_progress" | "completed" | "incomplete";
}

interface ResponseBuilderState {
  responseId: string;
  model: string;
  created: number;
  outputItems: ResponseOutputItem[];
  currentMessage?: Partial<ResponseOutputMessage>;
  currentToolCalls: Map<string, ToolCallInProgress>;
  currentText?: string;
  status: "in_progress" | "completed" | "failed" | "incomplete";
  incompleteReason?: "max_output_tokens" | "content_filter";
}

export async function buildResponseItemsFromStream(
  stream: AsyncGenerator<ResponseStreamEvent>
): Promise<ResponseItem[]> {
  const state: ResponseBuilderState = {
    responseId: "",
    model: "",
    created: 0,
    outputItems: [],
    currentToolCalls: new Map(),
    status: "in_progress"
  };

  for await (const event of stream) {
    processStreamEvent(event, state);
  }

  return finalizeResponseItems(state);
}

function processStreamEvent(event: ResponseStreamEvent, state: ResponseBuilderState): void {
  switch (event.type) {
    case "response.created":
      handleResponseCreated(event, state);
      break;
    
    case "response.in_progress":
      state.status = "in_progress";
      break;
    
    case "response.completed":
      handleResponseCompleted(event, state);
      break;
    
    case "response.failed":
      handleResponseFailed(event, state);
      break;
    
    case "response.incomplete":
      handleResponseIncomplete(event, state);
      break;

    case "response.output_item.added":
      handleOutputItemAdded(event, state);
      break;

    case "response.output_item.done":
      handleOutputItemDone(event, state);
      break;

    case "response.content_part.added":
      handleContentPartAdded(event, state);
      break;

    case "response.content_part.done":
      handleContentPartDone(event, state);
      break;

    case "response.output_text.delta":
      handleTextDelta(event, state);
      break;

    case "response.function_call_arguments.delta":
      handleFunctionCallArgumentsDelta(event, state);
      break;

    case "response.function_call_arguments.done":
      handleFunctionCallArgumentsDone(event, state);
      break;
  }
}

function handleResponseCreated(event: ResponseCreatedEvent, state: ResponseBuilderState): void {
  state.responseId = event.response.id;
  state.model = event.response.model;
  state.created = event.response.created_at;
}

function handleResponseCompleted(event: ResponseCompletedEvent, state: ResponseBuilderState): void {
  state.status = "completed";
  if (event.response.output) {
    state.outputItems = event.response.output;
  }
}

function handleResponseFailed(event: ResponseFailedEvent, state: ResponseBuilderState): void {
  state.status = "failed";
}

function handleResponseIncomplete(event: ResponseIncompleteEvent, state: ResponseBuilderState): void {
  state.status = "incomplete";
  if (event.response.incomplete_details?.reason) {
    state.incompleteReason = event.response.incomplete_details.reason;
  }
}

function handleOutputItemAdded(event: ResponseOutputItemAddedEvent, state: ResponseBuilderState): void {
  const item = event.item;
  
  if (item.type === "message") {
    state.currentMessage = {
      type: "message",
      role: item.role,
      content: []
    };
  } else if (isFunctionCallOutput(item) && item.id) {
    const toolCall: ToolCallInProgress = {
      id: item.id,
      call_id: item.call_id,
      name: item.name,
      arguments: "",
      status: item.status
    };
    state.currentToolCalls.set(item.call_id, toolCall);
  }
}

function handleOutputItemDone(event: ResponseOutputItemDoneEvent, state: ResponseBuilderState): void {
  const item = event.item;
  
  // Simply add the item directly to output - it's already a valid ResponseItem
  state.outputItems.push(item as ResponseOutputItem);
  
  // Clean up state based on item type
  if (isMessageOutput(item)) {
    state.currentMessage = undefined;
    state.currentText = undefined;
  } else if (isFunctionCallOutput(item)) {
    state.currentToolCalls.delete(item.call_id);
  }
}

function handleContentPartAdded(event: ResponseContentPartAddedEvent, state: ResponseBuilderState): void {
  if (event.part.type === "output_text" && state.currentMessage) {
    state.currentText = "";
  }
}

function handleContentPartDone(event: ResponseContentPartDoneEvent, state: ResponseBuilderState): void {
  if (event.part.type === "output_text" && state.currentMessage && state.currentText !== undefined) {
    const textContent: ResponseOutputText = {
      type: "output_text",
      text: state.currentText,
      annotations: [],
      logprobs: []
    };
    
    if (!state.currentMessage.content) {
      state.currentMessage.content = [];
    }
    state.currentMessage.content.push(textContent);
    state.currentText = undefined;
  }
}

function handleTextDelta(event: ResponseTextDeltaEvent, state: ResponseBuilderState): void {
  if (state.currentText !== undefined) {
    state.currentText += event.delta;
  }
}

function handleFunctionCallArgumentsDelta(event: ResponseFunctionCallArgumentsDeltaEvent, state: ResponseBuilderState): void {
  // ResponseFunctionCallArgumentsDeltaEvent has item_id property
  for (const [callId, toolCall] of state.currentToolCalls) {
    if (toolCall.id === event.item_id) {
      toolCall.arguments = (toolCall.arguments || "") + event.delta;
      break;
    }
  }
}

function handleFunctionCallArgumentsDone(event: ResponseFunctionCallArgumentsDoneEvent, state: ResponseBuilderState): void {
  // ResponseFunctionCallArgumentsDoneEvent has item_id property
  for (const [callId, toolCall] of state.currentToolCalls) {
    if (toolCall.id === event.item_id) {
      toolCall.arguments = event.arguments;
      break;
    }
  }
}

function finalizeResponseItems(state: ResponseBuilderState): ResponseItem[] {
  const items: ResponseItem[] = [];
  
  // Add any remaining current message
  if (state.currentMessage && state.currentMessage.content) {
    if (state.currentText !== undefined) {
      const textContent: ResponseOutputText = {
        type: "output_text",
        text: state.currentText,
        annotations: [],
        logprobs: []
      };
      state.currentMessage.content.push(textContent);
    }
    
    const message: ResponseOutputMessage = {
      ...state.currentMessage,
      type: "message",
      role: state.currentMessage.role || "assistant",
      content: state.currentMessage.content
    } as ResponseOutputMessage;
    
    items.push(message);
  }
  
  // Add any remaining tool calls
  for (const [callId, toolCall] of state.currentToolCalls) {
    if (toolCall.id && toolCall.name) {
      const toolCallItem: ResponseFunctionToolCallItem = {
        type: "function_call",
        id: toolCall.id,
        call_id: callId,
        name: toolCall.name,
        arguments: toolCall.arguments || ""
      };
      
      items.push(toolCallItem);
    }
  }
  
  // Add all completed output items
  // Convert ResponseOutputItems to ResponseItems
  for (const outputItem of state.outputItems) {
    if (isFunctionCallOutput(outputItem)) {
      // ResponseFunctionToolCall needs to be converted to ResponseFunctionToolCallItem
      if (outputItem.id) {
        const toolCallItem: ResponseFunctionToolCallItem = {
          type: "function_call",
          id: outputItem.id,
          call_id: outputItem.call_id,
          name: outputItem.name,
          arguments: outputItem.arguments
        };
        items.push(toolCallItem);
      }
    } else if (isResponseItemCompatible(outputItem)) {
      // These types are compatible between ResponseOutputItem and ResponseItem
      items.push(outputItem);
    }
  }
  
  return items;
}