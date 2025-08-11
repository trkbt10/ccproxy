import type { MessageCreateParams as ClaudeMessageCreateParams, Tool as ClaudeTool } from "@anthropic-ai/sdk/resources/messages";
import type { ResponseCreateParams, Tool as OpenAITool, FunctionTool } from "openai/resources/responses/responses";
import type { ResponsesModel as OpenAIResponseModel } from "openai/resources/shared";
import type { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
import { convertClaudeMessage } from "./message-converters";

export function claudeToResponsesLocal(
  req: ClaudeMessageCreateParams,
  modelResolver: () => OpenAIResponseModel,
  idManager: UnifiedIdManager,
  _lastResponseId?: string | undefined,
  _routingConfig?: unknown,
  _providerId?: string
): ResponseCreateParams {
  const model = modelResolver();
  const inputItems: NonNullable<ResponseCreateParams["input"]> = [];

  for (const m of req.messages) {
    const parts = convertClaudeMessage(m, idManager);
    inputItems.push(...(parts as any));
  }

  const tools = mapClaudeToolsToResponses(Array.isArray(req.tools) ? req.tools.filter((t): t is Extract<ClaudeTool, { input_schema: unknown }> => typeof (t as any).input_schema === 'object' && (t as any).input_schema !== null) : undefined);

  const body: ResponseCreateParams = {
    model: model as unknown as string,
    input: inputItems,
    instructions: typeof req.system === 'string' ? req.system : undefined,
    stream: !!req.stream,
  };
  if (tools && tools.length > 0) body.tools = tools;
  if (typeof req.max_tokens === 'number') (body as any).max_output_tokens = req.max_tokens;
  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (typeof req.top_p === 'number') body.top_p = req.top_p;
  return body;
}

function mapClaudeToolsToResponses(tools?: ClaudeTool[]): OpenAITool[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const out: OpenAITool[] = [];
  for (const t of tools) {
    const params = ((): Record<string, unknown> | null => {
      const sch = (t as { input_schema?: unknown }).input_schema;
      if (typeof sch === 'object' && sch !== null) return sch as Record<string, unknown>;
      return {};
    })();
    const fn: FunctionTool = {
      type: 'function',
      name: t.name,
      description: t.description ?? null,
      parameters: params,
      strict: true,
    };
    out.push(fn as OpenAITool);
  }
  return out;
}
