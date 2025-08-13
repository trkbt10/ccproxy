import type { Provider } from "../../../config/types";
import { selectApiKey } from "../shared/select-api-key";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { ensureGrokStream, isGrokChatCompletion, isEasyInputMessage, isResponseInputMessageItem } from "./guards";
import type { GrokChatMessage, GrokFunctionTool, GrokToolChoice } from "./guards";
import { extractTextFromContent, normalizeInputItems, mapTools, mapToolChoice, parseSSEStream } from "./utils";
import { grokToOpenAIResponse, grokToOpenAIStream } from "./openai-response-adapter";
import { resolveModelForProvider } from "../shared/model-mapper";
import { httpErrorFromResponse } from "../../errors/http-error";
import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

export function responsesToGrokRequest(params: ResponseCreateParams): {
  model?: unknown;
  messages: GrokChatMessage[];
  tools?: GrokFunctionTool[];
  tool_choice?: GrokToolChoice;
} {
  const messages: GrokChatMessage[] = [];
  const input = (params as { input?: unknown }).input;
  const arr = normalizeInputItems(input);
  for (const it of arr) {
    if (isEasyInputMessage(it) || isResponseInputMessageItem(it)) {
      const role = (it as { role: string }).role;
      const content = extractTextFromContent((it as { content: unknown }).content);
      messages.push({ role, content });
    }
  }
  const tools = mapTools((params as { tools?: unknown }).tools);
  const tool_choice = mapToolChoice((params as { tool_choice?: unknown }).tool_choice);
  const model = (params as { model?: unknown }).model;
  const body: {
    model?: unknown;
    messages: GrokChatMessage[];
    tools?: GrokFunctionTool[];
    tool_choice?: GrokToolChoice;
  } = { model, messages };
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  return body;
}

export function buildOpenAICompatibleClientForGrok(provider: Provider, modelHint?: string): OpenAICompatibleClient {
  const baseURL = (provider.baseURL || "https://api.x.ai/v1").replace(/\/$/, "");
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Grok API key");
  const auth = `Bearer ${apiKey}`;
  const chatCompletionsCreate = async function create(
    params: ChatCompletionCreateParams,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const model = await resolveModelForProvider({
      provider,
      sourceModel: params.model || modelHint,
      modelHint,
    });

    const url = new URL(baseURL + "/chat/completions");

    if (params.stream) {
      // For streaming requests
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({ ...params, model, stream: true }),
        signal: options?.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw httpErrorFromResponse(res as unknown as Response, text);
      }

      return parseSSEStream(res.body);
    }

    // For non-streaming requests
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ ...params, model, stream: false }),
      signal: options?.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw httpErrorFromResponse(res as unknown as Response, text);
    }

    return await res.json();
  } as {
    (params: ChatCompletionCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<ChatCompletion>;
    (params: ChatCompletionCreateParamsStreaming, options?: { signal?: AbortSignal }): Promise<
      AsyncIterable<ChatCompletionChunk>
    >;
    (params: ChatCompletionCreateParams, options?: { signal?: AbortSignal }): Promise<
      ChatCompletion | AsyncIterable<ChatCompletionChunk>
    >;
  };

  const responsesCreate = async function create(
    params: ResponseCreateParams,
    options?: { signal?: AbortSignal }
  ): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>> {
    const model = await resolveModelForProvider({
      provider,
      sourceModel: (params as { model?: string }).model || (modelHint as string | undefined),
      modelHint,
    });
    const body = responsesToGrokRequest(params);
    if ((params as { stream?: boolean }).stream === true) {
      const url = new URL(baseURL + "/chat/completions");
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({ ...body, model, stream: true }),
        signal: options?.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw httpErrorFromResponse(res as unknown as Response, text);
      }
      return grokToOpenAIStream(ensureGrokStream(parseSSEStream(res.body))) as AsyncIterable<ResponseStreamEvent>;
    }
    const url = new URL(baseURL + "/chat/completions");
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ ...body, model, stream: false }),
      signal: options?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw httpErrorFromResponse(res as unknown as Response, text);
    }
    const raw = (await res.json()) as unknown;
    if (!isGrokChatCompletion(raw)) throw new Error("Unexpected Grok response shape");
    return grokToOpenAIResponse(raw, model) as OpenAIResponse;
  } as {
    (params: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<OpenAIResponse>;
    (params: ResponseCreateParamsStreaming, options?: { signal?: AbortSignal }): Promise<
      AsyncIterable<ResponseStreamEvent>
    >;
    (params: ResponseCreateParams, options?: { signal?: AbortSignal }): Promise<
      OpenAIResponse | AsyncIterable<ResponseStreamEvent>
    >;
  };

  return {
    chat: {
      completions: {
        create: chatCompletionsCreate,
      },
    },
    responses: {
      create: responsesCreate,
    },
    models: {
      async list() {
        const url = new URL(baseURL + "/models");
        const res = await fetch(url.toString(), {
          headers: { Authorization: auth },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw httpErrorFromResponse(res as unknown as Response, text);
        }
        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        const data = (json.data || []).map((m) => ({ id: m.id || "" })).filter((m) => m.id);
        return { data } as { data: Array<{ id: string }> };
      },
    },
  };
}
