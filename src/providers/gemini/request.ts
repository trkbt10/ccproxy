import type {
  ResponseCreateParams,
  ResponseInput,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
  GenerateContentRequest,
  GeminiContent,
  GeminiPart,
} from "./fetch-client";

export function messagesToGeminiContents(
  messages: ChatCompletionMessageParam[]
): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role === "system") {
      const text =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (!text) continue;
      const firstUser = contents.find((c) => c.role === "user");
      if (firstUser) firstUser.parts.push({ text });
      else contents.push({ role: "user", parts: [{ text }] });
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      const role: GeminiContent["role"] = m.role === "user" ? "user" : "model";
      const parts: GeminiPart[] = [];
      if (typeof m.content === "string") {
        if (m.content) parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        const text = m.content
          .map((p) => {
            if (typeof p === "string") return p;
            if (p && typeof p === "object" && "type" in p) {
              const obj = p as { type?: string; text?: string };
              if (obj.type === "text" && typeof obj.text === "string")
                return obj.text;
            }
            return "";
          })
          .join("");
        if (text) parts.push({ text });
      }
      if (parts.length > 0) contents.push({ role, parts });
      continue;
    }
  }
  return contents;
}

export function responsesToGeminiRequest(
  params: ResponseCreateParams,
  toolNameResolver?: (callId: string) => string | undefined
): GenerateContentRequest {
  const contents: GeminiContent[] = [];

  // instructions as system
  const sys = (params as { instructions?: string }).instructions;
  if (typeof sys === "string" && sys) {
    contents.push({ role: "user", parts: [{ text: sys }] });
  }

  // input can be string or structured
  const input = (params as { input?: unknown }).input as
    | ResponseInput
    | string
    | undefined;
  if (typeof input === "string") {
    contents.push({ role: "user", parts: [{ text: input }] });
  } else if (Array.isArray(input)) {
    for (const item of input as ResponseInputItem[]) {
      if (!item || typeof item !== "object") continue;
      if ((item as { type?: string }).type === "message") {
        const msg = item as {
          type: "message";
          role: string;
          content: Array<{ type: string; text?: string }>;
        };
        const text = (msg.content || [])
          .map((p) =>
            p &&
            typeof p === "object" &&
            "text" in p &&
            typeof p.text === "string"
              ? p.text
              : ""
          )
          .join("");
        if (text)
          contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text }],
          });
      } else if ((item as { type?: string }).type === "function_call_output") {
        const out = item as {
          type: "function_call_output";
          call_id: string;
          output: unknown;
        };
        const nameFromResolver = toolNameResolver
          ? toolNameResolver(out.call_id)
          : undefined;
        if (nameFromResolver) {
          contents.push({
            role: "function",
            parts: [
              {
                functionResponse: {
                  name: nameFromResolver,
                  response: out.output,
                },
              } as GeminiPart,
            ],
          });
        }
      }
    }
  }

  const body: GenerateContentRequest = { contents };
  const gen: GenerateContentRequest["generationConfig"] = {};
  const p = params as {
    max_output_tokens?: number;
    temperature?: number;
    top_p?: number;
    tool_choice?: unknown;
    tools?: unknown[];
  };
  if (typeof p.max_output_tokens === "number")
    gen.maxOutputTokens = p.max_output_tokens;
  if (typeof p.temperature === "number") gen.temperature = p.temperature;
  if (typeof p.top_p === "number") gen.topP = p.top_p;
  if (Object.keys(gen).length > 0) body.generationConfig = gen;

  // Tools
  const tools = Array.isArray(p.tools)
    ? p.tools
        .filter(
          (
            t: unknown
          ): t is {
            type: string;
            name?: string;
            description?: string;
            parameters?: unknown;
          } =>
            !!t &&
            typeof t === "object" &&
            (t as { type?: string }).type === "function"
        )
        .map((t) => ({
          name: t.name || "",
          description: t.description || "",
          parameters: t.parameters || { type: "object" },
        }))
    : [];
  if (tools.length > 0)
    (body as GenerateContentRequest & { tools?: unknown[] }).tools = [
      { functionDeclarations: tools },
    ];

  // Tool choice
  const tc = p.tool_choice;
  const mutable = body as GenerateContentRequest & { toolConfig?: unknown };
  if (tc === "auto")
    mutable.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  else if (tc === "none")
    mutable.toolConfig = { functionCallingConfig: { mode: "NONE" } };
  else if (tc === "required")
    mutable.toolConfig = { functionCallingConfig: { mode: "ANY" } };
  else if (
    tc &&
    typeof tc === "object" &&
    (tc as { type?: string }).type === "function"
  ) {
    const name = (tc as { function?: { name?: string } }).function?.name;
    if (typeof name === "string" && name)
      mutable.toolConfig = {
        functionCallingConfig: { mode: "ANY", allowedFunctionNames: [name] },
      };
  }

  return body;
}
