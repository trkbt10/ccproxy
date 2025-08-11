import type { ChatCompletionCreateParams, ChatCompletion, ChatCompletionChunk } from "openai/resources/chat/completions";
import type { RoutingConfig } from "../../../config/types";
import type { Context } from "hono";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";
import { buildProviderClient } from "../build-provider-client";

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
  const providerId = routingConfig.defaults?.providerId || 'default';
  const model = (chatRequest.model as string) || routingConfig.defaults?.model || 'gpt-4o-mini';
  const openai = buildProviderClient(routingConfig.providers?.[providerId], model);

  // Build OpenAI Responses request from Chat Completions request
  const openaiReq: ResponseCreateParams = mapChatToResponses(chatRequest);

  if (chatRequest.stream) {
    async function* iterator(): AsyncIterable<ChatCompletionChunk> {
      const iterable = (await openai.responses.create(openaiReq)) as AsyncIterable<ResponseStreamEvent>;
      for await (const ev of iterable) {
        const chunk = mapResponseEventToChatChunk(ev, model);
        if (chunk) yield chunk;
      }
    }
    return { type: 'stream', stream: iterator() };
  }

  async function getBody(): Promise<ChatCompletion> {
    const resp = (await openai.responses.create({ ...openaiReq, stream: false })) as OpenAIResponse;
    return mapResponseToChatCompletion(resp, model);
  }
  return { type: 'json', getBody };
}

function mapChatToResponses(chat: ChatCompletionCreateParams): ResponseCreateParams {
  const input = (chat.messages || []).map((m) => ({
    type: 'message',
    role: m.role,
    content: typeof m.content === 'string'
      ? [{ type: 'input_text', text: m.content }]
      : (Array.isArray(m.content)
        ? m.content
            .map((p) => ('type' in (p as object) && (p as any).type === 'text' ? { type: 'input_text', text: (p as any).text as string } : null))
            .filter((x): x is { type: 'input_text'; text: string } => !!x)
        : []),
  }));
  const tools = (chat.tools || [])
    .filter((t) => t.type === 'function')
    .map((t) => ({ type: 'function', name: (t as any).function.name, description: (t as any).function.description, parameters: (t as any).function.parameters }));
  let tool_choice: ResponseCreateParams['tool_choice'] | undefined;
  if (chat.tool_choice) {
    if (typeof chat.tool_choice === 'string') tool_choice = chat.tool_choice as any;
    else if (chat.tool_choice.type === 'function') tool_choice = { type: 'function', name: chat.tool_choice.function.name } as any;
  }
  const req: ResponseCreateParams = {
    model: chat.model as any,
    input,
    stream: !!chat.stream,
    tools: tools.length ? (tools as any) : undefined,
    tool_choice,
    max_output_tokens: (chat as any).max_tokens ?? undefined,
    temperature: chat.temperature ?? undefined,
    top_p: chat.top_p ?? undefined,
  } as ResponseCreateParams;
  return req;
}

function mapResponseToChatCompletion(resp: OpenAIResponse, model: string): ChatCompletion {
  const text = (resp.output_text as string) || '';
  const toolCalls = Array.isArray(resp.output)
    ? resp.output.filter((i): i is ResponseFunctionToolCall => (i as any).type === 'function_call')
    : [];
  return {
    id: resp.id,
    object: 'chat.completion',
    created: resp.created_at || Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          refusal: null,
          tool_calls: toolCalls.length
            ? toolCalls.map((t) => ({ id: t.call_id, type: 'function' as const, function: { name: t.name, arguments: t.arguments } }))
            : undefined,
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: resp.usage?.input_tokens || 0,
      completion_tokens: resp.usage?.output_tokens || 0,
      total_tokens: (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0),
    },
  };
}

function mapResponseEventToChatChunk(ev: ResponseStreamEvent, model: string): ChatCompletionChunk | null {
  if (ev.type === 'response.output_text.delta') {
    return {
      id: `chatcmpl_${Date.now()}`,
      object: 'chat.completion.chunk',
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
  if (ev.type === 'response.completed') {
    return {
      id: `chatcmpl_${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
    };
  }
  return null;
}
