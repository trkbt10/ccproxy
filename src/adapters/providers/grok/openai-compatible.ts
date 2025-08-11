import type { Provider } from "../../../config/types";
import { getAdapterFor } from "../registry";
import type {
  Responses as OpenAIResponsesNS,
  ResponseCreateParams,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-compat/types";
import { ensureGrokStream, isGrokChatCompletion } from "../guards";
import { grokToOpenAIResponse, grokToOpenAIStream } from "./openai-response-adapter";
import { resolveModelForProvider } from "../shared/model-mapper";

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

export function buildOpenAICompatibleClientForGrok(
  provider: Provider,
  modelHint?: string,
  adapterOverride?: ReturnType<typeof getAdapterFor>
): OpenAICompatibleClient {
  const adapter = adapterOverride || getAdapterFor(provider, modelHint);
  return {
    responses: {
      async create(params: ResponseCreateParams, options?: { signal?: AbortSignal }): Promise<any> {
        const model = await resolveModelForProvider({
          provider,
          sourceModel: (params as { model?: string }).model || (modelHint as string | undefined),
          modelHint,
        });
        const body = responsesToGrokRequest(params);
        if ((params as { stream?: boolean }).stream === true) {
          if (!adapter.stream) throw new Error("Grok adapter does not support streaming");
          const stream = adapter.stream({ model, input: body, signal: options?.signal });
          return grokToOpenAIStream(ensureGrokStream(stream as AsyncIterable<unknown>));
        }
        const raw = await adapter.generate({ model, input: body, signal: options?.signal });
        if (!isGrokChatCompletion(raw)) throw new Error("Unexpected Grok response shape");
        return grokToOpenAIResponse(raw, model);
      },
    },
    models: {
      async list() {
        const res = await adapter.listModels();
        return { data: res.data.map((m) => ({ id: m.id })) };
      },
    },
  };
}
