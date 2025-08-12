import type { MessageCreateParams as ClaudeMessageCreateParams, Tool as ClaudeTool } from "@anthropic-ai/sdk/resources/messages";
import type { ResponseCreateParams, Tool as OpenAITool, FunctionTool, ResponseInputItem, ToolChoiceOptions, ToolChoiceFunction } from "openai/resources/responses/responses";
import type { ToolChoice as ClaudeToolChoice } from "@anthropic-ai/sdk/resources/messages";
import type { ResponsesModel as OpenAIResponseModel } from "openai/resources/shared";
import { convertClaudeMessage } from "./message-converters";

export function claudeToResponsesLocal(
  req: ClaudeMessageCreateParams,
  modelResolver: () => OpenAIResponseModel,
  _lastResponseId?: string | undefined,
  _routingConfig?: unknown,
  _providerId?: string
): ResponseCreateParams {
  const model = modelResolver();
  const inputItems: ResponseInputItem[] = [];

  for (const m of req.messages) {
    const parts = convertClaudeMessage(m);
    inputItems.push(...parts);
  }

  const tools = mapClaudeToolsToResponses(
    Array.isArray(req.tools)
      ? req.tools.filter(isClaudeCustomTool)
      : undefined
  );

  const body: ResponseCreateParams = {
    model: model,
    input: inputItems,
    instructions: typeof req.system === 'string' ? req.system : undefined,
    stream: !!req.stream,
  };
  if (tools && tools.length > 0) body.tools = tools;
  // Map tool choice (Claude -> OpenAI Responses)
  if (req.tool_choice) {
    const mapped = mapClaudeToolChoiceToResponses(req.tool_choice);
    if (mapped) {
      body.tool_choice = mapped;
    }
  }
  if (typeof req.max_tokens === 'number') body.max_output_tokens = req.max_tokens;
  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (typeof req.top_p === 'number') body.top_p = req.top_p;
  return body;
}

function mapClaudeToolsToResponses(tools?: ClaudeTool[]): OpenAITool[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const out: OpenAITool[] = [];
  for (const t of tools) {
    const params: Record<string, unknown> = t.input_schema as unknown as Record<string, unknown>;
    const fn: FunctionTool = {
      type: 'function',
      name: t.name,
      description: t.description ?? null,
      parameters: params,
      strict: true,
    };
    out.push(fn);
  }
  return out;
}

function mapClaudeToolChoiceToResponses(choice: ClaudeToolChoice): ToolChoiceOptions | ToolChoiceFunction | undefined {
  switch (choice.type) {
    case 'auto':
      return 'auto';
    case 'none':
      return 'none';
    case 'any':
      // Force the model to call at least one tool
      return 'required';
    case 'tool':
      return { type: 'function', name: choice.name };
    default:
      return undefined;
  }
}

// Type guard for Claude custom tool definition (with input_schema)
function isClaudeCustomTool(t: unknown): t is ClaudeTool {
  if (typeof t !== 'object' || t === null) return false;
  const rec = t as Record<string, unknown>;
  const hasName = typeof rec.name === 'string';
  const hasSchema = typeof rec.input_schema === 'object' && rec.input_schema !== null;
  return hasName && hasSchema;
}
