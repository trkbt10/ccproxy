import type { ChatCompletionCreateParams, ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { MessageCreateParams as ClaudeMessageCreateParams, Tool as ClaudeTool } from "@anthropic-ai/sdk/resources/messages";
import { contentToPlainText, isChatCompletionFunctionTool } from "./guards";
import { mapModelToProvider } from "../shared/model-mapper";
import { normalizeJSONSchemaForOpenAI } from "./schema-normalizer";

function mapModel(model: string): string {
  return mapModelToProvider({ targetProviderType: "claude", sourceModel: model });
}

function convertTools(tools?: ChatCompletionTool[]): ClaudeTool[] | undefined {
  if (!tools) return undefined;
  const out: ClaudeTool[] = [];
  for (const t of tools) {
    if (isChatCompletionFunctionTool(t)) {
      const params = t.function.parameters;
      // Convert function parameters to Claude's input_schema format
      let inputSchema: ClaudeTool["input_schema"];
      if (params && typeof params === 'object') {
        // Normalize the schema to ensure compatibility
        const normalized = normalizeJSONSchemaForOpenAI(params);
        // If it already has the correct structure, use it
        if ('type' in normalized && normalized.type === 'object') {
          inputSchema = normalized;
        } else {
          // Wrap in object schema format
          inputSchema = normalizeJSONSchemaForOpenAI({
            type: "object",
            properties: normalized.properties || normalized,
            required: normalized.required
          });
        }
      } else {
        inputSchema = normalizeJSONSchemaForOpenAI({ type: "object", properties: {} });
      }
      
      out.push({
        name: t.function.name,
        description: t.function.description || "",
        input_schema: inputSchema,
      });
    }
  }
  return out.length ? out : undefined;
}

function convertToolChoice(toolChoice: ChatCompletionCreateParams["tool_choice"]): ClaudeMessageCreateParams["tool_choice"] | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none") return { type: "none" };
  if (toolChoice === "required" || toolChoice === "auto") return { type: "any" };
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

function convertMessages(msgs: ChatCompletionMessageParam[]): ClaudeMessageCreateParams["messages"] {
  const out: ClaudeMessageCreateParams["messages"] = [];
  for (const m of msgs) {
    if (m.role === "system") {
      // system is handled at top-level in chatCompletionToClaudeLocal
      continue;
    }
    const contentText = contentToPlainText(m.content);
    if (m.role === "user" || m.role === "assistant") {
      out.push({ role: m.role, content: contentText });
    }
  }
  // Prepend a system message into system field via caller; we return messages without system entries
  return out;
}

export function chatCompletionToClaudeLocal(request: ChatCompletionCreateParams): ClaudeMessageCreateParams {
  const model = mapModel(typeof request.model === 'string' ? request.model : String(request.model));
  const messages = convertMessages(request.messages);
  const systemTexts = (request.messages || [])
    .filter((m) => m.role === "system")
    .map((m) => contentToPlainText(m.content))
    .filter(Boolean);

  const claudeReq: ClaudeMessageCreateParams = {
    model,
    messages,
    max_tokens: typeof request.max_tokens === 'number' ? request.max_tokens : 4096,
    stream: !!request.stream,
  };

  if (systemTexts.length) claudeReq.system = systemTexts.join("\n\n");
  const tools = convertTools(request.tools);
  if (tools) claudeReq.tools = tools;
  const choice = convertToolChoice(request.tool_choice);
  if (choice) claudeReq.tool_choice = choice;
  if (request.temperature != null) claudeReq.temperature = request.temperature ?? undefined;
  if (request.top_p != null) claudeReq.top_p = request.top_p ?? undefined;
  if (request.stop) {
    const stop = request.stop;
    claudeReq.stop_sequences = Array.isArray(stop) ? stop : [String(stop)];
  }
  
  
  return claudeReq;
}

function isInputSchema(v: unknown): v is { type: 'object' } & Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { type?: unknown }).type === 'object'
  );
}
