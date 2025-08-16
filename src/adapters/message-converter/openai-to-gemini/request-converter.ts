import type { ChatCompletionCreateParams, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
  ResponseCreateParams,
  ResponseInput,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type { GeminiGenerateContentRequest, GeminiContent, GeminiPart } from "./types";
import type {
  GenerateContentRequest,
  GeminiContent as ClientGeminiContent,
  GeminiPart as ClientGeminiPart,
} from "../../providers/gemini/client/fetch-client";

export function geminiToOpenAI(
  geminiReq: GeminiGenerateContentRequest,
  model: string
): ChatCompletionCreateParams {
  const messages: ChatCompletionCreateParams["messages"] = [];

  // Convert system instruction if present
  if (geminiReq.systemInstruction) {
    const systemContent = extractTextFromParts(geminiReq.systemInstruction.parts);
    if (systemContent) {
      messages.push({
        role: "system",
        content: systemContent
      });
    }
  }

  // Convert contents to messages
  for (const content of geminiReq.contents) {
    const role = mapGeminiRoleToOpenAI(content.role);
    
    // Handle multi-part content
    if (content.parts.length === 1 && content.parts[0].text) {
      // Simple text message
      if (role === "tool") {
        messages.push({
          role,
          content: content.parts[0].text,
          tool_call_id: `call_${generateId()}`
        });
      } else {
        messages.push({
          role,
          content: content.parts[0].text
        });
      }
    } else {
      // Multi-part or complex content
      const messageContent = convertPartsToOpenAIContent(content.parts);
      if (messageContent) {
        if (typeof messageContent === "string") {
          if (role === "tool") {
            messages.push({ 
              role, 
              content: messageContent,
              tool_call_id: `call_${generateId()}`
            });
          } else {
            messages.push({ role, content: messageContent });
          }
        } else if (content.parts[0].function_call) {
          // Function call
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `call_${generateId()}`,
              type: "function",
              function: {
                name: content.parts[0].function_call.name,
                arguments: JSON.stringify(content.parts[0].function_call.args)
              }
            }]
          });
        } else if (content.parts[0].function_response) {
          // Function response
          messages.push({
            role: "tool",
            content: JSON.stringify(content.parts[0].function_response.response),
            tool_call_id: `call_${generateId()}`
          });
        } else {
          // Multi-modal content
          if (role === "tool") {
            messages.push({
              role,
              content: messageContent,
              tool_call_id: `call_${generateId()}`
            } as ChatCompletionMessageParam);
          } else {
            messages.push({
              role,
              content: messageContent
            } as ChatCompletionMessageParam);
          }
        }
      }
    }
  }

  // Build OpenAI request
  const openAIReq: ChatCompletionCreateParams = {
    model,
    messages,
  };

  // Convert generation config
  if (geminiReq.generationConfig) {
    const config = geminiReq.generationConfig;
    if (config.temperature !== undefined) openAIReq.temperature = config.temperature;
    if (config.topP !== undefined) openAIReq.top_p = config.topP;
    if (config.maxOutputTokens !== undefined) openAIReq.max_tokens = config.maxOutputTokens;
    if (config.stopSequences) openAIReq.stop = config.stopSequences;
    if (config.candidateCount) openAIReq.n = config.candidateCount;
  }

  // Convert tools
  if (geminiReq.tools && geminiReq.tools.length > 0) {
    openAIReq.tools = [];
    for (const tool of geminiReq.tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          openAIReq.tools.push({
            type: "function",
            function: {
              name: func.name,
              description: func.description,
              parameters: func.parameters || {}
            }
          });
        }
      }
    }

    // Convert tool config
    if (geminiReq.toolConfig?.functionCallingConfig) {
      const mode = geminiReq.toolConfig.functionCallingConfig.mode;
      if (mode === "ANY") {
        openAIReq.tool_choice = "required";
      } else if (mode === "NONE") {
        openAIReq.tool_choice = "none";
      } else {
        openAIReq.tool_choice = "auto";
      }
    }
  }

  return openAIReq;
}

function mapGeminiRoleToOpenAI(role?: string): "system" | "user" | "assistant" | "tool" {
  switch (role) {
    case "user":
      return "user";
    case "model":
      return "assistant";
    case "function":
      return "tool";
    default:
      return "user";
  }
}

function extractTextFromParts(parts: GeminiPart[]): string {
  return parts
    .filter(part => part.text)
    .map(part => part.text)
    .join("\n");
}

function convertPartsToOpenAIContent(parts: GeminiPart[]): string | Array<any> | null {
  // If all parts are text, concatenate them
  if (parts.every(part => part.text)) {
    return parts.map(part => part.text).join("\n");
  }

  // Handle multi-modal content
  const content: Array<any> = [];
  for (const part of parts) {
    if (part.text) {
      content.push({ type: "text", text: part.text });
    } else if (part.inline_data) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`
        }
      });
    }
  }

  return content.length > 0 ? content : null;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// OpenAI to Gemini conversion functions
export function messagesToGeminiContents(
  messages: ChatCompletionMessageParam[]
): ClientGeminiContent[] {
  const contents: ClientGeminiContent[] = [];
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
      const role: ClientGeminiContent["role"] = m.role === "user" ? "user" : "model";
      const parts: ClientGeminiPart[] = [];
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
  const contents: ClientGeminiContent[] = [];

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
              } as ClientGeminiPart,
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