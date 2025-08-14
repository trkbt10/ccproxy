import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

// Shared helper
interface RequestOptions {
  signal?: AbortSignal;
}

// Reusable overload interfaces
export interface ChatCompletionsCreateFn {
  (params: ChatCompletionCreateParamsNonStreaming, options?: RequestOptions): Promise<ChatCompletion>;
  (params: ChatCompletionCreateParamsStreaming, options?: RequestOptions): Promise<AsyncIterable<ChatCompletionChunk>>;
  (params: ChatCompletionCreateParams, options?: RequestOptions): Promise<
    ChatCompletion | AsyncIterable<ChatCompletionChunk>
  >;
}

export interface ResponsesCreateFn {
  (params: ResponseCreateParamsNonStreaming, options?: RequestOptions): Promise<OpenAIResponse>;
  (params: ResponseCreateParamsStreaming, options?: RequestOptions): Promise<AsyncIterable<ResponseStreamEvent>>;
  (params: ResponseCreateParams, options?: RequestOptions): Promise<
    OpenAIResponse | AsyncIterable<ResponseStreamEvent>
  >;
}

// Factory helpers (centralize the only casts)
export function defineChatCompletionsCreate(
  impl: (
    params: ChatCompletionCreateParams,
    options?: RequestOptions
  ) => Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>
): ChatCompletionsCreateFn {
  return impl as unknown as ChatCompletionsCreateFn;
}

export function defineResponsesCreate(
  impl: (
    params: ResponseCreateParams,
    options?: RequestOptions
  ) => Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>>
): ResponsesCreateFn {
  return impl as unknown as ResponsesCreateFn;
}

export interface OpenAICompatibleClient {
  chat: {
    completions: {
      create: ChatCompletionsCreateFn;
    };
  };
  responses: {
    create: ResponsesCreateFn;
  };
  models: {
    list(): Promise<{ data: Array<{ id: string; created: number; object: string; owned_by: string }> }>;
  };
  setToolNameResolver?(resolver: (callId: string) => string | undefined): void;
  setConversationId?(conversationId: string): void;
}

export type {
  OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
};
