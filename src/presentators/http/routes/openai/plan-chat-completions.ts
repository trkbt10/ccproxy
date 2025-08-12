import type {
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type { RoutingConfig } from "../../../../config/types";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { buildProviderClient } from "../../../../adapters/providers/build-provider-client";
import {
  buildResponseInputFromChatMessages,
  mapChatToolsToResponses,
  mapChatToolChoiceToResponses,
  isOpenAIResponse,
  isResponseEventStream,
} from "../../../../adapters/providers/openai-compat/guards";
import { isFunctionCallOutput } from "../../../../adapters/responses-adapter/type-guards";

export type ChatCompletionsPlan =
  | { type: "json"; getBody: () => Promise<ChatCompletion> }
  | { type: "stream"; stream: AsyncIterable<ChatCompletionChunk> };

export type PlanOptions = {
  requestId: string;
  conversationId: string;
  abortController: AbortController;
};

export async function planChatCompletions(
  routingConfig: RoutingConfig,
  chatRequest: ChatCompletionCreateParams,
  opts: PlanOptions
): Promise<ChatCompletionsPlan> {
  const providerId = routingConfig.defaults?.providerId || "default";
  const model =
    (chatRequest.model as string) ||
    routingConfig.defaults?.model ||
    "gpt-4o-mini";
  const openai = buildProviderClient(
    routingConfig.providers?.[providerId],
    model
  );

  // Build OpenAI Responses request from Chat Completions request
  const openaiReq: ResponseCreateParams = mapChatToResponses(chatRequest);

  if (chatRequest.stream) {
    async function* iterator(): AsyncIterable<ChatCompletionChunk> {
      const maybeStream = await openai.responses.create(openaiReq);
      if (!isResponseEventStream(maybeStream))
        throw new Error("Expected ResponseStreamEvent iterable");
      for await (const ev of maybeStream) {
        const chunk = mapResponseEventToChatChunk(ev, model);
        if (chunk) yield chunk;
      }
    }
    return { type: "stream", stream: iterator() };
  }

  async function getBody(): Promise<ChatCompletion> {
    const maybeResp = await openai.responses.create({
      ...openaiReq,
      stream: false,
    });
    if (!isOpenAIResponse(maybeResp))
      throw new Error("Expected OpenAIResponse");
    return mapResponseToChatCompletion(maybeResp, model);
  }
  return { type: "json", getBody };
}

function mapChatToResponses(
  chat: ChatCompletionCreateParams
): ResponseCreateParams {
  const input = buildResponseInputFromChatMessages(chat.messages);
  const tools = mapChatToolsToResponses(chat.tools);
  const tool_choice = mapChatToolChoiceToResponses(chat.tool_choice);
  const req: ResponseCreateParams = {
    model: chat.model as string,
    input,
    stream: !!chat.stream,
    tools,
    tool_choice,
    max_output_tokens: chat.max_tokens ?? undefined,
    temperature: chat.temperature ?? undefined,
    top_p: chat.top_p ?? undefined,
  } as ResponseCreateParams;
  return req;
}

function mapResponseToChatCompletion(
  resp: OpenAIResponse,
  model: string
): ChatCompletion {
  const text = (resp.output_text || "") as string;
  const toolCalls = Array.isArray(resp.output)
    ? resp.output.filter((i) => isFunctionCallOutput(i))
    : [];
  return {
    id: resp.id,
    object: "chat.completion",
    created: resp.created_at || Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          refusal: null,
          tool_calls: toolCalls.length
            ? toolCalls.map((t) => ({
                id: t.call_id,
                type: "function" as const,
                function: { name: t.name, arguments: t.arguments },
              }))
            : undefined,
        },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: resp.usage?.input_tokens || 0,
      completion_tokens: resp.usage?.output_tokens || 0,
      total_tokens:
        (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0),
    },
  };
}

function mapResponseEventToChatChunk(
  ev: ResponseStreamEvent,
  model: string
): ChatCompletionChunk | null {
  if (ev.type === "response.output_text.delta") {
    return {
      id: `chatcmpl_${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { content: ev.delta },
          finish_reason: null,
          logprobs: null,
        },
      ],
    };
  }
  if (ev.type === "response.completed") {
    return {
      id: `chatcmpl_${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
          logprobs: null,
        },
      ],
    };
  }
  return null;
}
