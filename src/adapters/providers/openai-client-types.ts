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
  setToolNameResolver?(
    resolver: (callId: string) => string | undefined
  ): void;
  setConversationId?(conversationId: string): void;
};

export type { OpenAIResponse, ResponseCreateParams, ResponseCreateParamsNonStreaming, ResponseCreateParamsStreaming, ResponseStreamEvent };

