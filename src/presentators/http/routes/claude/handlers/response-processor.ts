import type { OpenAICompatibleClient } from "../../../../../adapters/providers/openai-client-types";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
  Tool,
} from "openai/resources/responses/responses";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { OpenAIToClaudeSSEStream } from "../../../../../adapters/message-converter/openai-to-claude/streaming-sse";
import { HonoSSESink } from "../../../streaming/hono-sse-sink";
import { convertOpenAIResponseToClaude } from "../../../../../adapters/message-converter/openai-to-claude/response";
import type { ConversationStore } from "../../../../../utils/conversation/conversation-store";
// Using OpenAICompatibleClient for Responses-compatible flow
import {
  logError,
  logInfo,
  logDebug,
  logUnexpected,
  logRequestResponse,
  logPerformance,
} from "../../../../../utils/logging/migrate-logger";
import type { RoutingConfig } from "../../../../../config/types";
// ID manager no longer required; conversions are deterministic

export type ProcessorConfig = {
  requestId: string;
  conversationId: string;
  openai: OpenAICompatibleClient;
  claudeReq: ClaudeMessageCreateParams;
  model: string;
  stream: boolean;
  signal?: AbortSignal;
  routingConfig?: RoutingConfig;
  providerId?: string;
  store: ConversationStore;
};

export type ProcessorResult = { responseId?: string };

function handleError(
  requestId: string,
  openaiReq: ResponseCreateParams,
  error: unknown,
  conversationId?: string
): void {
  const context = { requestId, endpoint: "responses.create" };

  if (
    error instanceof Error &&
    "status" in error &&
    (error as Error & { status?: number }).status === 400 &&
    error.message?.includes("No tool output found")
  ) {
    logUnexpected(
      "Tool output should be found in conversation history",
      "No tool output found error",
      { tools: openaiReq.tools?.length, input: openaiReq.input, errorMessage: error.message },
      context
    );
  } else {
    logError("Request processing error", error, context);
  }
}

async function processNonStreamingResponse(
  config: ProcessorConfig,
  openaiReq: ResponseCreateParams,
  c: Context
): Promise<Response> {
  const startTime = Date.now();
  const context = { requestId: config.requestId, conversationId: config.conversationId, stream: false };

  try {
    logDebug("Starting non-streaming response", { openaiReq }, context);
    const respOrStream = await config.openai.responses.create(
      { ...openaiReq, stream: false },
      config.signal ? { signal: config.signal } : undefined
    );
    function isOpenAIResponse(v: unknown): v is OpenAIResponse {
      return (
        typeof v === "object" &&
        v !== null &&
        "object" in (v as Record<string, unknown>) &&
        (v as { object?: unknown }).object === "response"
      );
    }
    if (!isOpenAIResponse(respOrStream)) throw new Error("Expected non-streaming OpenAI response shape");
    const response = respOrStream;

    const { message: claudeResponse } = convertOpenAIResponseToClaude(response);

    config.store.updateConversationState({
      conversationId: config.conversationId,
      requestId: config.requestId,
      responseId: response.id,
    });

    const duration = Date.now() - startTime;
    logRequestResponse(openaiReq, response, duration, context);
    logPerformance("non-streaming-response", duration, { responseId: response.id }, context);

    return c.json(claudeResponse);
  } catch (error) {
    handleError(config.requestId, openaiReq, error, config.conversationId);
    throw error;
  }
}

async function processStreamingResponse(
  config: ProcessorConfig,
  openaiReq: ResponseCreateParams,
  c: Context
): Promise<Response> {
  return streamSSE(c, async (stream) => {
    const context = { requestId: config.requestId, conversationId: config.conversationId, stream: true };
    logDebug("OpenAI Request Params", openaiReq, context);

    const sink = new HonoSSESink(stream);
    const sse = new OpenAIToClaudeSSEStream(
      sink,
      config.conversationId,
      config.requestId,
      config.routingConfig?.logging?.eventsEnabled === true
    );

    try {
      await sse.start("msg_" + config.requestId);
      const iterable = await config.openai.responses.create(
        { ...openaiReq, stream: true },
        config.signal ? { signal: config.signal } : undefined
      );

      for await (const event of iterable as AsyncIterable<ResponseStreamEvent>) {
        if (config.signal?.aborted) break;
        await sse.processEvent(event);
      }

      const { responseId } = sse.getResult();
      config.store.updateConversationState({
        conversationId: config.conversationId,
        requestId: config.requestId,
        responseId,
      });
      logInfo("Streaming completed", { responseId }, context);
    } catch (error) {
      try {
        const errorObj = error as { status?: number; code?: string };
        const status = errorObj.status;
        const code = errorObj.code;
        const type =
          code ||
          (status === 401
            ? "unauthorized"
            : status === 429
            ? "rate_limited"
            : status && status >= 500
            ? "upstream_error"
            : status && status >= 400
            ? "bad_request"
            : "api_error");
        await sse.error(type, String(error));
      } catch {}
      handleError(config.requestId, openaiReq, error, config.conversationId);
      throw error;
    } finally {
      sse.cleanup();
    }
  });
}

export function createResponseProcessor(config: ProcessorConfig) {
  // Build complete Responses request from Claude request including tools
  async function buildOpenAIRequest(req: ClaudeMessageCreateParams): Promise<ResponseCreateParams> {
    const openaiReq: ResponseCreateParams = {
      model: config.model,
      input: req.messages?.map(msg => ({
        type: "message" as const,
        role: msg.role,
        content: [{ type: "input_text", text: String(msg.content || "") }],
      })) || [],
      stream: config.stream,
    };

    // Add system message if present
    if (req.system) {
      openaiReq.instructions = typeof req.system === 'string' ? req.system : null;
    }

    // Convert and add tools if present
    if (req.tools && req.tools.length > 0) {
      openaiReq.tools = req.tools.map(tool => {
        // Handle both legacy tools (with description/input_schema) and new tools
        const toolAny = tool as any;
        return {
          type: "function" as const,
          name: tool.name,
          description: toolAny.description || "",
          parameters: toolAny.input_schema || {},
          strict: false,
        } satisfies Tool;
      });
    }

    // Convert tool choice if present
    if (req.tool_choice) {
      if (req.tool_choice.type === "none") {
        openaiReq.tool_choice = "none";
      } else if (req.tool_choice.type === "any") {
        openaiReq.tool_choice = "auto";
      } else if (req.tool_choice.type === "tool" && 'name' in req.tool_choice) {
        openaiReq.tool_choice = {
          type: "function",
          name: req.tool_choice.name,
        };
      }
    }

    // Add other parameters
    if (req.max_tokens) {
      openaiReq.max_output_tokens = req.max_tokens;
    }
    if (req.temperature != null) {
      openaiReq.temperature = req.temperature;
    }
    if (req.top_p != null) {
      openaiReq.top_p = req.top_p;
    }

    return openaiReq;
  }

  async function process(c: Context): Promise<Response> {
    const openaiReq = await buildOpenAIRequest(config.claudeReq);
    logDebug("OpenAI Request Params", openaiReq, { requestId: config.requestId });
    return config.stream
      ? processStreamingResponse(config, openaiReq, c)
      : processNonStreamingResponse(config, openaiReq, c);
  }

  return { process };
}
