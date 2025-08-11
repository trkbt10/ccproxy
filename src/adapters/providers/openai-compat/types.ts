import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

export type OpenAICompatibleClient = {
  responses: {
    create(
      params: ResponseCreateParams,
      options?: { signal?: AbortSignal }
    ): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>>;
  };
  models: {
    list(): Promise<{ data: Array<{ id: string }> }>;
  };
  // Optional hook: allow passing a tool name resolver for roundtrip mapping
  setToolNameResolver?(
    resolver: (callId: string) => string | undefined
  ): void;
  // Optional: bind a conversation for ID management across turns
  setConversationId?(conversationId: string): void;
};

export type { OpenAIResponse, ResponseCreateParams, ResponseCreateParamsNonStreaming, ResponseCreateParamsStreaming, ResponseStreamEvent };
