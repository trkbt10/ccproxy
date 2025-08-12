import type { OpenAICompatibleClient } from "../../../../../adapters/providers/openai-client-types";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { OpenAIToClaudeSSEStream } from "../../../../../adapters/message-converter/openai-to-claude/streaming-sse";
import { HonoSSESink } from "../../../streaming/hono-sse-sink";
import { convertOpenAIResponseToClaude } from "../../../../../adapters/message-converter/openai-to-claude/response";
import { conversationStore } from "../../../../../utils/conversation/conversation-store";
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

    conversationStore.updateConversationState({
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
      conversationStore.updateConversationState({
        conversationId: config.conversationId,
        requestId: config.requestId,
        responseId,
      });
      logInfo("Streaming completed", { responseId }, context);
    } catch (error) {
      try {
        const status = (error as any)?.status as number | undefined;
        const code = (error as any)?.code as string | undefined;
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
  // Build minimal Responses request from Claude request (text-only)
  async function buildOpenAIRequest(req: ClaudeMessageCreateParams): Promise<ResponseCreateParams> {
    return {
      model: config.model,
      input: [
        {
          type: "message",
          role: req.messages?.[0]?.role || "user",
          content: [
            { type: "input_text", text: String((req.messages?.[0] as any)?.content || "") },
          ],
        },
      ],
      stream: config.stream,
    } as ResponseCreateParams;
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
