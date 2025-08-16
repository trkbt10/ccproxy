import { describe, it, expect } from "vitest";
import { buildResponseItemsFromStream } from "./stream-to-response-builder";
import type { 
  ResponseStreamEvent,
  ResponseCreatedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseCompletedEvent,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  Response
} from "openai/resources/responses/responses";

async function* createMockStream(events: ResponseStreamEvent[]): AsyncGenerator<ResponseStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

function createMockResponse(overrides: Partial<Response> = {}): Response {
  return {
    id: "resp_123",
    model: "gpt-4",
    created_at: 1234567890,
    object: "response",
    status: "in_progress",
    output: [],
    tools: [],
    tool_choice: "auto",
    temperature: 0.7,
    top_p: 1.0,
    parallel_tool_calls: false,
    output_text: "",
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    ...overrides
  };
}

describe("buildResponseItemsFromStream", () => {
  it("should build a simple text message response", async () => {
    const events: ResponseStreamEvent[] = [
      {
        type: "response.created",
        response: createMockResponse(),
        sequence_number: 1
      } satisfies ResponseCreatedEvent,
      
      {
        type: "response.output_item.added",
        item: {
          type: "message",
          role: "assistant",
          id: "msg_1",
          status: "in_progress",
          content: []
        },
        output_index: 0,
        sequence_number: 2
      } satisfies ResponseOutputItemAddedEvent,
      
      {
        type: "response.content_part.added",
        part: { 
          type: "output_text", 
          text: "", 
          annotations: [], 
          logprobs: [] 
        },
        content_index: 0,
        item_id: "item_1",
        output_index: 0,
        sequence_number: 3
      } satisfies ResponseContentPartAddedEvent,
      
      {
        type: "response.output_text.delta",
        delta: "Hello, ",
        content_index: 0,
        item_id: "item_1",
        output_index: 0,
        logprobs: [],
        sequence_number: 4
      } satisfies ResponseTextDeltaEvent,
      
      {
        type: "response.output_text.delta",
        delta: "world!",
        content_index: 0,
        item_id: "item_1",
        output_index: 0,
        logprobs: [],
        sequence_number: 5
      } satisfies ResponseTextDeltaEvent,
      
      {
        type: "response.content_part.done",
        part: { 
          type: "output_text", 
          text: "Hello, world!", 
          annotations: [], 
          logprobs: [] 
        },
        content_index: 0,
        item_id: "item_1",
        output_index: 0,
        sequence_number: 6
      } satisfies ResponseContentPartDoneEvent,
      
      {
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          id: "msg_1",
          status: "completed",
          content: [{ 
            type: "output_text", 
            text: "Hello, world!", 
            annotations: [], 
            logprobs: [] 
          }]
        },
        output_index: 0,
        sequence_number: 7
      } satisfies ResponseOutputItemDoneEvent,
      
      {
        type: "response.completed",
        response: createMockResponse({
          status: "completed",
          output: [{
            type: "message",
            role: "assistant",
            id: "msg_1",
            status: "completed",
            content: [{ 
              type: "output_text", 
              text: "Hello, world!", 
              annotations: [], 
              logprobs: [] 
            }]
          }],
          output_text: "Hello, world!"
        }),
        sequence_number: 8
      } satisfies ResponseCompletedEvent
    ];

    const stream = createMockStream(events);
    const items = await buildResponseItemsFromStream(stream);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "Hello, world!"
        }
      ]
    });
  });

  it("should build a function call response", async () => {
    const events: ResponseStreamEvent[] = [
      {
        type: "response.created",
        response: createMockResponse({ id: "resp_456" }),
        sequence_number: 1
      } satisfies ResponseCreatedEvent,
      
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          id: "fc_789",
          call_id: "call_789",
          name: "get_weather",
          arguments: "",
          status: "in_progress"
        },
        output_index: 0,
        sequence_number: 2
      } satisfies ResponseOutputItemAddedEvent,
      
      {
        type: "response.function_call_arguments.delta",
        delta: '{"location": "',
        item_id: "fc_789",
        output_index: 0,
        sequence_number: 3
      } satisfies ResponseFunctionCallArgumentsDeltaEvent,
      
      {
        type: "response.function_call_arguments.delta",
        delta: 'San Francisco"}',
        item_id: "fc_789",
        output_index: 0,
        sequence_number: 4
      } satisfies ResponseFunctionCallArgumentsDeltaEvent,
      
      {
        type: "response.function_call_arguments.done",
        arguments: '{"location": "San Francisco"}',
        item_id: "fc_789",
        output_index: 0,
        sequence_number: 5
      } satisfies ResponseFunctionCallArgumentsDoneEvent,
      
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "fc_789",
          call_id: "call_789",
          name: "get_weather",
          arguments: '{"location": "San Francisco"}',
          status: "completed"
        },
        output_index: 0,
        sequence_number: 6
      } satisfies ResponseOutputItemDoneEvent,
      
      {
        type: "response.completed",
        response: createMockResponse({
          id: "resp_456",
          status: "completed",
          output: [{
            type: "function_call",
            id: "fc_789",
            call_id: "call_789",
            name: "get_weather",
            arguments: '{"location": "San Francisco"}',
            status: "completed"
          }]
        }),
        sequence_number: 7
      } satisfies ResponseCompletedEvent
    ];

    const stream = createMockStream(events);
    const items = await buildResponseItemsFromStream(stream);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "function_call",
      id: "fc_789",
      call_id: "call_789",
      name: "get_weather",
      arguments: '{"location": "San Francisco"}'
    });
  });

  it("should handle mixed message and function call responses", async () => {
    const events: ResponseStreamEvent[] = [
      {
        type: "response.created",
        response: createMockResponse({ id: "resp_mixed" }),
        sequence_number: 1
      } satisfies ResponseCreatedEvent,
      
      // First item: message
      {
        type: "response.output_item.added",
        item: {
          type: "message",
          role: "assistant",
          id: "msg_1",
          status: "in_progress",
          content: []
        },
        output_index: 0,
        sequence_number: 2
      } satisfies ResponseOutputItemAddedEvent,
      
      {
        type: "response.content_part.added",
        part: { 
          type: "output_text", 
          text: "", 
          annotations: [], 
          logprobs: [] 
        },
        content_index: 0,
        item_id: "item_msg",
        output_index: 0,
        sequence_number: 3
      } satisfies ResponseContentPartAddedEvent,
      
      {
        type: "response.output_text.delta",
        delta: "I'll check the weather for you.",
        content_index: 0,
        item_id: "item_msg",
        output_index: 0,
        logprobs: [],
        sequence_number: 4
      } satisfies ResponseTextDeltaEvent,
      
      {
        type: "response.content_part.done",
        part: { 
          type: "output_text", 
          text: "I'll check the weather for you.", 
          annotations: [], 
          logprobs: [] 
        },
        content_index: 0,
        item_id: "item_msg",
        output_index: 0,
        sequence_number: 5
      } satisfies ResponseContentPartDoneEvent,
      
      {
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          id: "msg_1",
          status: "completed",
          content: [{ 
            type: "output_text", 
            text: "I'll check the weather for you.", 
            annotations: [], 
            logprobs: [] 
          }]
        },
        output_index: 0,
        sequence_number: 6
      } satisfies ResponseOutputItemDoneEvent,
      
      // Second item: function call
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          id: "fc_weather",
          call_id: "call_weather",
          name: "get_weather",
          arguments: "",
          status: "in_progress"
        },
        output_index: 1,
        sequence_number: 7
      } satisfies ResponseOutputItemAddedEvent,
      
      {
        type: "response.function_call_arguments.done",
        arguments: '{"location": "Tokyo"}',
        item_id: "fc_weather",
        output_index: 1,
        sequence_number: 8
      } satisfies ResponseFunctionCallArgumentsDoneEvent,
      
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "fc_weather",
          call_id: "call_weather",
          name: "get_weather",
          arguments: '{"location": "Tokyo"}',
          status: "completed"
        },
        output_index: 1,
        sequence_number: 9
      } satisfies ResponseOutputItemDoneEvent,
      
      {
        type: "response.completed",
        response: createMockResponse({
          id: "resp_mixed",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              id: "msg_1",
              status: "completed",
              content: [{ 
                type: "output_text", 
                text: "I'll check the weather for you.", 
                annotations: [], 
                logprobs: [] 
              }]
            },
            {
              type: "function_call",
              id: "fc_weather",
              call_id: "call_weather",
              name: "get_weather",
              arguments: '{"location": "Tokyo"}',
              status: "completed"
            }
          ],
          output_text: "I'll check the weather for you."
        }),
        sequence_number: 10
      } satisfies ResponseCompletedEvent
    ];

    const stream = createMockStream(events);
    const items = await buildResponseItemsFromStream(stream);

    expect(items).toHaveLength(2);
    
    expect(items[0]).toMatchObject({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "I'll check the weather for you."
        }
      ]
    });
    
    expect(items[1]).toMatchObject({
      type: "function_call",
      id: "fc_weather",
      call_id: "call_weather",
      name: "get_weather",
      arguments: '{"location": "Tokyo"}'
    });
  });

  it("should handle incomplete responses", async () => {
    const events: ResponseStreamEvent[] = [
      {
        type: "response.created",
        response: createMockResponse({ id: "resp_incomplete" }),
        sequence_number: 1
      } satisfies ResponseCreatedEvent,
      
      {
        type: "response.output_item.added",
        item: {
          type: "message",
          role: "assistant",
          id: "msg_1",
          status: "in_progress",
          content: []
        },
        output_index: 0,
        sequence_number: 2
      } satisfies ResponseOutputItemAddedEvent,
      
      {
        type: "response.content_part.added",
        part: { 
          type: "output_text", 
          text: "", 
          annotations: [], 
          logprobs: [] 
        },
        content_index: 0,
        item_id: "item_1",
        output_index: 0,
        sequence_number: 3
      } satisfies ResponseContentPartAddedEvent,
      
      {
        type: "response.output_text.delta",
        delta: "This is an incomplete",
        content_index: 0,
        item_id: "item_1",
        output_index: 0,
        logprobs: [],
        sequence_number: 4
      } satisfies ResponseTextDeltaEvent,
      
      // No done events - simulating incomplete response
    ];

    const stream = createMockStream(events);
    const items = await buildResponseItemsFromStream(stream);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "This is an incomplete"
        }
      ]
    });
  });

});