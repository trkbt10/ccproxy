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
  isFunctionTool,
} from "./guards";
import { isFunctionCallOutput } from "../../../../adapters/responses-adapter/type-guards";
import { planToolExecution } from "../../../../execution/tool-model-planner";

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
  const { providerId, model } = selectProviderForOpenAIChat(
    routingConfig,
    chatRequest
  );
  const provider = routingConfig.providers?.[providerId];
  if (!provider && providerId !== "default") {
    throw new Error(`Provider '${providerId}' not found`);
  }
  const openai = buildProviderClient(provider, model);

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

function selectProviderForOpenAIChat(
  cfg: RoutingConfig,
  req: ChatCompletionCreateParams
): { providerId: string; model: string } {
  const names: string[] = [];
  const choice = (req as { tool_choice?: unknown }).tool_choice as ChatCompletionCreateParams["tool_choice"] | undefined;
  if (choice && typeof choice === "object" && (choice as { type?: unknown }).type === "function") {
    const name = (choice as { function?: { name?: unknown } }).function?.name;
    if (typeof name === "string") names.push(name);
  }
  if (names.length === 0 && Array.isArray(req.tools)) {
    for (const t of req.tools) {
      if (isFunctionTool(t)) names.push(t.function.name);
    }
  }

  for (const name of names) {
    const steps = planToolExecution(cfg, name, undefined);
    for (const s of steps) {
      if (s.kind === "responses_model") {
        const providerId = s.providerId || cfg.defaults?.providerId || "default";
        const modelFromReq = typeof req.model === "string" ? req.model : undefined;
        const model = s.model || modelFromReq || cfg.defaults?.model;
        if (!model) {
          throw new Error("No model specified: provide request.model or defaults.model");
        }
        return { providerId, model };
      }
    }
  }

  const providers = cfg.providers || {};
  const providerId = cfg.defaults?.providerId
    ? cfg.defaults.providerId
    : providers["default"]
    ? "default"
    : Object.keys(providers).length === 1
    ? Object.keys(providers)[0]
    : "default";
  const model = (typeof req.model === "string" ? req.model : undefined) || cfg.defaults?.model;
  if (!model) {
    throw new Error("No model specified: provide request.model or defaults.model");
  }
  return { providerId, model };
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
