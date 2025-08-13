import type {
  ResponseCreateParams,
  ResponseCustomToolCall,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type { Provider, RoutingConfig } from "../../config/types";
import { createGenericToolInterceptor } from "../../presentators/http/common/tool-routing/interceptor-factory";
import { createClaudeToolProvider } from "../../presentators/http/routes/claude/tool-provider";
import type { ToolInterceptor } from "../../tools/runtime/interceptor";
import { logDebug, logInfo } from "../../utils/logging/migrate-logger";
import { buildOpenAICompatibleClient } from "./openai-client";
import type { OpenAICompatibleClient, ResponsesCreateFn } from "./openai-client-types";
import { defineResponsesCreate } from "./openai-client-types";

/**
 * Type guard for function tool calls
 */
function isFunctionToolCall(item: ResponseInputItem): item is ResponseFunctionToolCall {
  return (
    item !== null &&
    typeof item === "object" &&
    "type" in item &&
    item.type === "function_call" &&
    "call_id" in item &&
    "name" in item &&
    "arguments" in item
  );
}

/**
 * Type guard for custom tool calls
 */
function isCustomToolCall(item: ResponseInputItem): item is ResponseCustomToolCall {
  return (
    item !== null &&
    typeof item === "object" &&
    "type" in item &&
    item.type === "custom_tool_call" &&
    "call_id" in item &&
    "name" in item &&
    "input" in item
  );
}

/**
 * Extract tool calls from ResponseInput
 */
function extractToolCalls(input: ResponseInputItem[] | string): Array<{ id: string; name: string; input: unknown }> {
  const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];

  if (!Array.isArray(input)) {
    return toolCalls;
  }

  for (const item of input) {
    if (isFunctionToolCall(item)) {
      // Parse arguments JSON string to object
      let parsedInput: unknown = {};
      try {
        parsedInput = JSON.parse(item.arguments);
      } catch {
        parsedInput = item.arguments;
      }

      toolCalls.push({
        id: item.call_id,
        name: item.name,
        input: parsedInput,
      });
    } else if (isCustomToolCall(item)) {
      // Custom tool calls have input as string that may need parsing
      let parsedInput: unknown = item.input;
      try {
        parsedInput = JSON.parse(item.input);
      } catch {
        // Keep as string if not valid JSON
      }

      toolCalls.push({
        id: item.call_id,
        name: item.name,
        input: parsedInput,
      });
    }
  }

  return toolCalls;
}

/**
 * Intercept tool calls in request parameters
 */
function interceptToolCalls(params: ResponseCreateParams, toolInterceptor: ToolInterceptor, requestId?: string): void {
  if (!params.input || typeof params.input === "string") {
    return;
  }

  const toolCalls = extractToolCalls(params.input);

  if (toolCalls.length === 0) {
    return;
  }

  logDebug(
    "Analyzing request for internal tools",
    {
      toolCallCount: toolCalls.length,
      tools: toolCalls.map((tc) => ({ name: tc.name, id: tc.id })),
    },
    { requestId }
  );

  // Start intercepting internal tools (non-blocking)
  for (const toolCall of toolCalls) {
    const { intercept, handlerName } = toolInterceptor.shouldIntercept(toolCall.name, toolCall.input);

    if (intercept && handlerName) {
      logInfo(
        "Intercepting tool",
        {
          toolName: toolCall.name,
          toolUseId: toolCall.id,
          handlerName,
        },
        { requestId }
      );

      // Execute asynchronously
      toolInterceptor.interceptToolCall({
        toolUseId: toolCall.id,
        toolName: toolCall.name,
        handlerName,
        input: toolCall.input,
      });
    }
  }
}

/**
 * Create a wrapper function that intercepts tool calls
 */
function wrapResponsesCreate(
  originalCreate: ResponsesCreateFn,
  toolInterceptor: ToolInterceptor,
  requestId?: string
): ResponsesCreateFn {
  return defineResponsesCreate(async (params, options) => {
    // Intercept tools before delegating
    interceptToolCalls(params, toolInterceptor, requestId);

    // Delegate to original implementation
    return originalCreate(params, options);
  });
}

/**
 * Enhanced OpenAI client builder that adds tool interception
 */
export function buildOpenAICompatibleClientWithTools(
  provider: Provider,
  modelHint?: string,
  config?: {
    routingConfig?: RoutingConfig;
    requestId?: string;
    conversationId?: string;
  }
): OpenAICompatibleClient {
  // Get base client
  const baseClient = buildOpenAICompatibleClient(provider, modelHint);

  // If no tool config, return base client
  if (!config?.routingConfig || !config.requestId || !config.conversationId) {
    return baseClient;
  }

  // Create Claude-specific tool interceptor
  const toolInterceptor = createGenericToolInterceptor({
    requestId: config.requestId,
    conversationId: config.conversationId,
    routingConfig: config.routingConfig,
    toolProvider: createClaudeToolProvider(provider)
  });

  // Return enhanced client with wrapped responses.create
  return {
    ...baseClient,
    responses: {
      ...baseClient.responses,
      create: wrapResponsesCreate(baseClient.responses.create, toolInterceptor, config.requestId),
    },
  };
}
