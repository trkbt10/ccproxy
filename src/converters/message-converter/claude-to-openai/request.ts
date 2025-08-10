import type {
  MessageCreateParamsBase as ClaudeMessageCreateParamsBase,
  Model as ClaudeModel,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  Responses as OpenAIResponses,
  Tool as OpenAITool,
} from "openai/resources/responses/responses";
import type { ResponsesModel as OpenAIResponseModel } from "openai/resources/shared";
import { convertClaudeMessage } from "./message";
import { convertClaudeToolToOpenAI } from "./tool";
import { createWebSearchPreviewDefinition } from "./tool-definitions";
import { UnifiedIdManager as CallIdManager } from "../../../utils/id-management/unified-id-manager";
import type { RoutingConfig } from "../../../execution/tool-model-planner";

/**
 * Convert Claude request to OpenAI Responses API request
 */
export function claudeToResponses(
  req: ClaudeMessageCreateParamsBase,
  modelResolver: (model: ClaudeModel) => OpenAIResponseModel,
  callIdManager: CallIdManager,
  previousResponseId?: string,
  routingConfig?: RoutingConfig
): OpenAIResponses.ResponseCreateParams {
  const model: OpenAIResponseModel = modelResolver(req.model);
  const instructions = Array.isArray(req.system)
    ? req.system.map((b) => b.text).join("\n\n")
    : req.system ?? undefined;

  let input: OpenAIResponses.ResponseInputItem[] = [];

  // Process all messages to build the full conversation context
  // The Responses API needs the complete conversation history in each request
  const toolCalls = new Set<string>();
  const toolResults = new Set<string>();

  for (const message of req.messages) {
    const convertedItems = convertClaudeMessage(message, callIdManager, routingConfig);
    input.push(...convertedItems);

    // Track tool calls and results for validation
    for (const item of convertedItems) {
      if (item.type === "function_call" && "call_id" in item) {
        toolCalls.add(item.call_id);
      } else if (item.type === "function_call_output" && "call_id" in item) {
        toolResults.add(item.call_id);
      }
    }

    // Log for debugging
    console.log(
      `[DEBUG] Converted ${message.role} message to ${convertedItems.length} items`
    );

    // Log specific items for debugging
    for (const item of convertedItems) {
      if (item.type === "function_call" && "call_id" in item) {
        console.log(
          `[DEBUG] function_call: id=${item.id}, call_id=${item.call_id}, name=${item.name}`
        );
      } else if (item.type === "function_call_output" && "call_id" in item) {
        console.log(
          `[DEBUG] function_call_output: id=${item.id}, call_id=${item.call_id}, status=${item.status}`
        );
      }
    }
  }

  // Validate that all tool results have corresponding calls
  for (const resultId of toolResults) {
    if (!toolCalls.has(resultId)) {
      console.error(
        `[ERROR] Tool result with call_id="${resultId}" has no corresponding tool call in conversation history!`
      );
      
      // Log validation results from CallIdManager
      const validation = callIdManager.validateMappings();
      if (!validation.valid) {
        console.error(
          `[ERROR] Call ID mapping validation failed:`,
          validation.issues
        );
      }
    }
  }

  // Post-process: drop any function_call items that do not have a matching
  // function_call_output in THIS request. This avoids OpenAI 400 errors:
  // "No tool output found for function call <call_id>".
  // Rationale: function_call items in input should only be used to pair with
  // their outputs; otherwise, let the model decide tool calls.
  const outputIds = new Set<string>();
  for (const item of input) {
    if (item.type === "function_call_output" && "call_id" in item && item.call_id) {
      outputIds.add(item.call_id);
    }
  }

  const beforeLen = input.length;
  input = input.filter((item) => {
    if (item.type === "function_call" && "call_id" in item && item.call_id) {
      const keep = outputIds.has(item.call_id);
      if (!keep) {
        console.warn(
          `[WARN] Dropping function_call without matching output in current request: call_id=${item.call_id}`
        );
      }
      return keep;
    }
    return true;
  });
  if (beforeLen !== input.length) {
    console.log(
      `[DEBUG] Filtered input items. Before=${beforeLen} After=${input.length}`
    );
  }

  const toolsWithoutWebSearchPreview: OpenAITool[] | undefined = req.tools
    ? req.tools.flatMap<OpenAITool>(convertClaudeToolToOpenAI)
    : undefined;

  const tools: OpenAITool[] = [
    ...(toolsWithoutWebSearchPreview || []),
    createWebSearchPreviewDefinition(),
  ];

  let tool_choice: any = "auto";
  if (req.tool_choice?.type === "tool" && req.tool_choice.name) {
    tool_choice = {
      type: "function",
      function: { name: req.tool_choice.name },
    };
  } else if (req.tool_choice?.type === "any") {
    tool_choice = "required";
  }

  const baseParams: OpenAIResponses.ResponseCreateParams = {
    model,
    input,
    tools,
    tool_choice,
  };

  if (instructions) {
    baseParams.instructions = instructions;
  }

  if (req.max_tokens) {
    baseParams.max_output_tokens = Math.max(req.max_tokens, 16384);
  }

  if (req.top_p !== undefined) {
    baseParams.top_p = req.top_p;
  }

  // Add previous response ID if provided
  if (previousResponseId) {
    baseParams.previous_response_id = previousResponseId;
  }

  return baseParams;
}
