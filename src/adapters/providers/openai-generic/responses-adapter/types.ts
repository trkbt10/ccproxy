import type { 
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseFunctionToolCallOutputItem,
  ResponseOutputText,
  ResponseStreamEvent
} from "openai/resources/responses/responses";
import type { Stream } from "openai/streaming";
import type OpenAI from "openai";

export type { 
  OpenAIResponse,
  ResponseCreateParams,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseFunctionToolCallOutputItem,
  ResponseOutputText,
  ResponseStreamEvent,
  Stream 
};

export type ResponsesAPIOptions = {
  apiKey: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
};

export type ToolCall = {
  id: string;
  call_id: string;
  name: string;
  arguments: string;
};

export type StreamChunkData = {
  responseId: string;
  model: string;
  created: number;
  inputTokens: number;
  outputTokens: number;
};

export type CompletionStatus = "completed" | "incomplete";

export type IncompleteDetails = {
  reason: "max_output_tokens";
};

export type ConvertedTool = OpenAI.Chat.ChatCompletionTool;

export type ConvertedToolChoice = OpenAI.Chat.ChatCompletionToolChoiceOption;

export type ChatCompletionParams = OpenAI.Chat.ChatCompletionCreateParams;

export type ChatCompletion = OpenAI.Chat.ChatCompletion;

export type ChatCompletionChunk = OpenAI.Chat.ChatCompletionChunk;

export type ChatCompletionMessage = OpenAI.Chat.ChatCompletionMessage;

import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
export type { ChatCompletionMessageToolCall };
