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
  ToolChoiceFunction,
} from "openai/resources/responses/responses";
import type { Stream } from "openai/streaming";
import type { Metadata } from "openai/resources/shared";
import { convertChatCompletionToResponse } from "./chat-to-response-converter";
import { StreamHandler } from "./stream-handler";
import { convertResponseInputToMessages } from "./input-converter";
import { convertToolsForChat, convertToolChoiceForChat } from "./tool-converter";

/**
 * ResponsesAPI class that converts between Responses API and Chat Completions API
 */
export class ResponsesAPI {
  constructor(private openai: OpenAI) {}

  /**
   * Creates a response using OpenAI's chat completions API
   * while mimicking the Responses API interface
   */
  async create(params: ResponseCreateParamsNonStreaming): Promise<OpenAIResponse>;
  async create(params: ResponseCreateParamsStreaming): Promise<AsyncIterable<ResponseStreamEvent>>;
  async create(params: ResponseCreateParams): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>> {
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
        content: params.instructions,
      });
    }

    // Convert input to messages
    if (params.input) {
      if (typeof params.input === "string") {
        messages.push({
          role: "user",
          content: params.input,
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
    const model = params.model ?? "gpt-4o";
    const chatParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      stream: params.stream ?? false,
    };

    // Map optional parameters
    if (params.max_output_tokens !== undefined && params.max_output_tokens !== null) {
      chatParams.max_tokens = params.max_output_tokens;
    }

    // Temperature and top_p are disabled for all models
    // if (params.temperature !== undefined && params.temperature !== null) {
    //   chatParams.temperature = params.temperature;
    // }

    // if (params.top_p !== undefined && params.top_p !== null) {
    //   chatParams.top_p = params.top_p;
    // }

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

  private isO1Model(model: string): boolean {
    return model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4");
  }

  private async handleNonStreamingResponse(
    chatParams: OpenAI.Chat.ChatCompletionCreateParams
  ): Promise<OpenAIResponse> {
    const completion = await this.openai.chat.completions.create({
      ...chatParams,
      stream: false,
    });

    return convertChatCompletionToResponse(completion);
  }

  private async handleStreamingResponse(
    chatParams: OpenAI.Chat.ChatCompletionCreateParams
  ): Promise<AsyncIterable<ResponseStreamEvent>> {
    const stream = await this.openai.chat.completions.create({
      ...chatParams,
      stream: true,
    });

    const handler = new StreamHandler();
    // Return the async generator that yields ResponseStreamEvent objects
    return handler.handleStream(stream);
  }
}

