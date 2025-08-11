import type { Provider } from "../../../config/types";
import { getAdapterFor } from "../registry";
import type {
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { OpenAICompatibleClient } from "../openai-compat/types";
import { ensureGrokStream } from "./guards";
import { grokToOpenAIResponse, grokToOpenAIStream } from "./openai-response-adapter";

type GrokChatMessage = { role: string; content: string | null; tool_calls?: any[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => (isObject(p) && typeof p["type"] === "string" && p["type"] === "input_text" ? String((p as any).text ?? "") : ""))
      .filter(Boolean);
    return parts.join("");
  }
  return "";
}

function responsesToGrokRequest(params: ResponseCreateParams): any {
  const messages: GrokChatMessage[] = [];
  const input = (params as any).input as unknown;
  const inputArr: unknown[] = Array.isArray(input) ? input : typeof input === "string" ? [{ role: "user", content: input, type: "message" }] : [];
  for (const it of inputArr) {
    if (isObject(it)) {
      if ((it as any).type === "message" && typeof (it as any).role === "string") {
        const role = String((it as any).role);
        const content = extractTextFromContent((it as any).content);
        messages.push({ role, content });
      } else if (typeof (it as any).role === "string" && "content" in it) {
        // EasyInputMessage shape
        const role = String((it as any).role);
        const content = extractTextFromContent((it as any).content);
        messages.push({ role, content });
      }
    }
  }

  // Tools (functions) mapping (minimal)
  const tools: any[] | undefined = Array.isArray((params as any).tools)
    ? ((params as any).tools as any[]).flatMap((t) => {
        if (isObject(t) && (t as any).type === "function" && isObject((t as any).function)) {
          const fn = (t as any).function as { name?: string; parameters?: unknown; description?: string };
          if (typeof fn?.name === "string") {
            return [
              {
                type: "function",
                function: {
                  name: fn.name,
                  description: fn.description,
                  parameters: fn.parameters ?? { type: "object", properties: {} },
                },
              },
            ];
          }
        }
        return [];
      })
    : undefined;

  // tool_choice mapping
  let tool_choice: any = undefined;
  const tc = (params as any).tool_choice;
  if (tc === "required") {
    tool_choice = "required"; // Grok accepts 'required'?
  } else if (isObject(tc) && (tc as any).type === "function" && isObject((tc as any).function)) {
    const name = (tc as any).function?.name;
    if (typeof name === "string") {
      tool_choice = { type: "function", function: { name } };
    }
  }

  const body: any = {
    model: (params as any).model,
    messages,
  };
  if (tools && tools.length > 0) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  return body;
}

export function buildOpenAICompatibleClientForGrok(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const adapter = getAdapterFor(provider, modelHint);
  return {
    responses: {
      async create(
        params: ResponseCreateParams,
        options?: { signal?: AbortSignal }
      ): Promise<any> {
        const model = (params as any).model || modelHint || "grok-2-latest";
        const body = responsesToGrokRequest(params);
        if ("stream" in params && params.stream === true) {
          if (!adapter.stream) throw new Error("Grok adapter does not support streaming");
          const stream = adapter.stream({ model, input: body, signal: options?.signal });
          return grokToOpenAIStream(ensureGrokStream(stream as AsyncIterable<unknown>));
        }
        const raw = await adapter.generate({ model, input: body, signal: options?.signal });
        return grokToOpenAIResponse(raw, model);
      },
    },
    models: {
      async list() {
        const res = await (adapter as any).listModels?.();
        const data = res?.data ? res.data.map((m: any) => ({ id: m.id })) : [];
        return { data };
      },
    },
  };
}

