import OpenAI from "openai";
import type { 
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
  ResponseInputItem,
  ResponseInput,
  Tool,
  ToolChoiceOptions,
  ToolChoiceTypes,
  ToolChoiceFunction
} from "openai/resources/responses/responses";
import type { Stream } from "openai/streaming";
import type { Metadata } from "openai/resources/shared";
import { convertChatCompletionToResponse } from "./chat-to-response-converter";
import { StreamHandler } from "./stream-handler";
import { convertResponseInputToMessages } from "./input-converter";
import { convertToolsForChat, convertToolChoiceForChat } from "./tool-converter";

export type ResponsesAPIOptions = {
  apiKey: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
};

/**
 * ResponsesAPI class that mimics OpenAI's Responses API
 * but internally uses Chat Completions API
 */
export class ResponsesAPI {
  private openai: OpenAI;
  private callIdMapping: Map<string, string>;

  constructor(options: ResponsesAPIOptions) {
    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: options.maxRetries ?? 3,
      timeout: options.timeout ?? 60000,
    });
    this.callIdMapping = new Map<string, string>();
  }

  /**
   * Creates a response using OpenAI's chat completions API
   * while mimicking the Responses API interface
   */
  async create(
    params: ResponseCreateParamsNonStreaming
  ): Promise<OpenAIResponse>;
  async create(
    params: ResponseCreateParamsStreaming
  ): Promise<AsyncIterable<OpenAIResponse>>;
  async create(
    params: ResponseCreateParams
  ): Promise<OpenAIResponse | AsyncIterable<OpenAIResponse>> {
    
    // Convert ResponseInput to chat messages
    const messages = this.convertInputToMessages(params);
    
    // Build chat completion parameters
    const chatParams = this.buildChatParams(params, messages);

    if (params.stream) {
      return this.handleStreamingResponse(chatParams);
    } else {
      return this.handleNonStreamingResponse(chatParams);
    }
  }

  private convertInputToMessages(params: ResponseCreateParams): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    // Add system/developer instructions if provided
    if (params.instructions) {
      messages.push({
        role: "system",
        content: params.instructions
      });
    }

    // Convert input to messages
    if (params.input) {
      if (typeof params.input === "string") {
        messages.push({
          role: "user",
          content: params.input
        });
      } else {
        // Convert ResponseInput to messages
        const convertedMessages = convertResponseInputToMessages(params.input);
        messages.push(...convertedMessages);
      }
    }

    return messages;
  }

  private buildChatParams(
    params: ResponseCreateParams,
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
  ): OpenAI.Chat.ChatCompletionCreateParams {
    const chatParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: params.model ?? "gpt-4o",
      messages,
      stream: params.stream ?? false,
    };

    // Map optional parameters
    if (params.max_output_tokens !== undefined && params.max_output_tokens !== null) {
      chatParams.max_tokens = params.max_output_tokens;
    }

    if (params.temperature !== undefined && params.temperature !== null) {
      chatParams.temperature = params.temperature;
    }

    if (params.top_p !== undefined && params.top_p !== null) {
      chatParams.top_p = params.top_p;
    }

    if (params.tools) {
      chatParams.tools = convertToolsForChat(params.tools);
    }

    if (params.tool_choice) {
      chatParams.tool_choice = convertToolChoiceForChat(params.tool_choice);
    }

    if (params.metadata) {
      chatParams.metadata = params.metadata;
    }

    // Note: The Responses API doesn't have a direct response_format parameter
    // If you need structured outputs, you might need to handle this differently
    // based on your specific requirements

    return chatParams;
  }

  private async handleNonStreamingResponse(
    chatParams: OpenAI.Chat.ChatCompletionCreateParams
  ): Promise<OpenAIResponse> {
    const completion = await this.openai.chat.completions.create({
      ...chatParams,
      stream: false,
    });

    return convertChatCompletionToResponse(completion, this.callIdMapping);
  }

  private async handleStreamingResponse(
    chatParams: OpenAI.Chat.ChatCompletionCreateParams
  ): Promise<AsyncIterable<OpenAIResponse>> {
    const stream = await this.openai.chat.completions.create({
      ...chatParams,
      stream: true,
    });

    const handler = new StreamHandler(this.callIdMapping);
    
    // Return the async generator that yields OpenAIResponse objects
    return handler.handleStream(stream);
  }

  /**
   * Gets the current call ID mapping
   */
  getCallIdMapping(): Map<string, string> {
    return new Map(this.callIdMapping);
  }

  /**
   * Sets the call ID mapping (useful for maintaining state across requests)
   */
  setCallIdMapping(mapping: Map<string, string>): void {
    this.callIdMapping = new Map(mapping);
  }

  /**
   * Clears the call ID mapping
   */
  clearCallIdMapping(): void {
    this.callIdMapping.clear();
  }
}