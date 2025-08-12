import type { Provider } from "../../../config/types";
import { selectApiKey } from "../shared/select-api-key";
import { parseSSELine } from "../shared/sse";
import type {
  Responses as OpenAIResponsesNS,
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { ensureGrokStream, isGrokChatCompletion } from "../grok/guards";
import { grokToOpenAIResponse, grokToOpenAIStream } from "./openai-response-adapter";
import { resolveModelForProvider } from "../shared/model-mapper";
import { httpErrorFromResponse } from "../../errors/http-error";
import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
  ChatCompletionChunk
} from "openai/resources/chat/completions";

type GrokChatMessage = { role: string; content: string | null };
type GrokFunctionTool = { type: "function"; function: { name: string; description?: string; parameters?: unknown } };
type GrokToolChoice = { type: "function"; function: { name: string } } | "required";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (!isObject(p)) return "";
        const t = (p as { type?: unknown }).type;
        if (t === "input_text" && typeof (p as { text?: unknown }).text === "string") {
          return String((p as { text?: unknown }).text);
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("");
  }
  return "";
}

function isEasyInputMessage(v: unknown): v is OpenAIResponsesNS.EasyInputMessage {
  return (
    isObject(v) &&
    (v as { type?: unknown }).type === "message" &&
    typeof (v as { role?: unknown }).role === "string" &&
    "content" in v
  );
}

function isResponseInputMessageItem(v: unknown): v is OpenAIResponsesNS.ResponseInputItem.Message {
  return (
    isObject(v) &&
    (v as { type?: unknown }).type === "message" &&
    typeof (v as { role?: unknown }).role === "string" &&
    "content" in v
  );
}

function normalizeInputItems(input: unknown): unknown[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input, type: "message" } satisfies OpenAIResponsesNS.EasyInputMessage];
  }
  if (Array.isArray(input)) return input as unknown[];
  return [];
}

function isFunctionTool(t: unknown): t is OpenAIResponsesNS.Tool & { type: "function"; function: { name: string; parameters?: unknown; description?: string } } {
  return (
    isObject(t) &&
    (t as { type?: unknown }).type === "function" &&
    isObject((t as { function?: unknown }).function) &&
    typeof ((t as { function: { name?: unknown } }).function.name) === "string"
  );
}

function mapTools(tools: unknown): GrokFunctionTool[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: GrokFunctionTool[] = [];
  for (const t of tools) {
    if (isFunctionTool(t)) {
      out.push({
        type: "function",
        function: {
          name: t.function.name,
          description: (t.function as { description?: string }).description,
          parameters: (t.function as { parameters?: unknown }).parameters ?? { type: "object", properties: {} },
        },
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

function mapToolChoice(tc: unknown): GrokToolChoice | undefined {
  if (tc === "required") return "required";
  if (isObject(tc) && (tc as { type?: unknown }).type === "function" && isObject((tc as { function?: unknown }).function)) {
    const name = (tc as { function: { name?: unknown } }).function.name;
    if (typeof name === "string") return { type: "function", function: { name } };
  }
  return undefined;
}

export function responsesToGrokRequest(params: ResponseCreateParams): { model?: unknown; messages: GrokChatMessage[]; tools?: GrokFunctionTool[]; tool_choice?: GrokToolChoice } {
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
  const body: { model?: unknown; messages: GrokChatMessage[]; tools?: GrokFunctionTool[]; tool_choice?: GrokToolChoice } = { model, messages };
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  return body;
}

async function* parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<any, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages (separated by double newlines)
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const payload = parseSSELine(raw);
        if (payload) yield payload;
      }
    }
    
    // Process any remaining data
    if (buffer.trim()) {
      const payload = parseSSELine(buffer.trim());
      if (payload) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

export function buildOpenAICompatibleClientForGrok(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
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
    (params: ChatCompletionCreateParamsStreaming, options?: { signal?: AbortSignal }): Promise<AsyncIterable<ChatCompletionChunk>>;
    (params: ChatCompletionCreateParams, options?: { signal?: AbortSignal }): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;
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
    (params: ResponseCreateParamsStreaming, options?: { signal?: AbortSignal }): Promise<AsyncIterable<ResponseStreamEvent>>;
    (params: ResponseCreateParams, options?: { signal?: AbortSignal }): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>>;
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
