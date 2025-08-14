import type { OpenAICompatibleClient } from "../../../../../adapters/providers/openai-client-types";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { ResponsesModel } from "openai/resources/shared";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { openAIToClaudeStream } from "../../../../../adapters/message-converter/openai-to-claude";
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
import { claudeToResponsesLocal } from "../../../../../adapters/providers/claude/request-to-responses";
// ID manager no longer required; conversions are deterministic

export type ProcessorConfig = {
  requestId: string;
  openai: OpenAICompatibleClient;
  claudeReq: ClaudeMessageCreateParams;
  model: string;
  stream: boolean;
  signal?: AbortSignal;
  routingConfig?: RoutingConfig;
  providerId?: string;
};

export type ProcessorResult = { responseId?: string };

function handleError(requestId: string, openaiReq: ResponseCreateParams, error: unknown): void {
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
  const context = { requestId: config.requestId, stream: false };

  try {
    logDebug("Starting non-streaming response", { openaiReq }, context);
    const response = await config.openai.responses.create(
      { ...openaiReq, stream: false },
      config.signal ? { signal: config.signal } : undefined
    );

    // Non-streaming responses are no longer supported
    // All responses should use the streaming implementation
    throw new Error("Non-streaming responses are deprecated. Please use streaming mode.");
  } catch (error) {
    handleError(config.requestId, openaiReq, error);
    throw error;
  }
}

async function processStreamingResponse(
  config: ProcessorConfig,
  openaiReq: ResponseCreateParams,
  c: Context
): Promise<Response> {
  return streamSSE(c, async (stream) => {
    const context = { requestId: config.requestId, stream: true };
    logDebug("OpenAI Request Params", openaiReq, context);

    let responseId: string | undefined;
    let pingInterval: NodeJS.Timeout | undefined;
    const messageId = "msg_" + config.requestId;

    const writeEvent = async (eventType: string, data: unknown) => {
      if (config.routingConfig?.logging?.eventsEnabled) {
        logDebug(`Sending SSE event: ${eventType}`, { eventType, data }, context);
      }
      console.log(`Sending SSE event: ${eventType}`);
      await stream.writeSSE({ event: eventType, data: JSON.stringify(data) });
    };

    try {
      pingInterval = setInterval(async () => {
        await stream.writeSSE({ event: "ping", data: JSON.stringify({}) });
      }, 15000);

      const iterable = await config.openai.responses.create(
        { ...openaiReq, stream: true },
        config.signal ? { signal: config.signal } : undefined
      );

      // Convert OpenAI stream to Claude stream and emit events
      let eventCount = 0;
      for await (const claudeEvent of openAIToClaudeStream(iterable, messageId)) {
        if (config.signal?.aborted) {
          await stream.abort();
          break;
        }
        eventCount++;

        await writeEvent(claudeEvent.type, claudeEvent);
      }
      logInfo(`Processed ${eventCount} Claude events`, {}, context);
      logInfo("Streaming completed", { responseId }, context);
      await stream.close();
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
        await writeEvent("error", { type, message: String(error) });
      } catch {}
      handleError(config.requestId, openaiReq, error);
      throw error;
    } finally {
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    }
  });
}

export function createResponseProcessor(config: ProcessorConfig) {
  async function process(c: Context): Promise<Response> {
    const openaiReq = claudeToResponsesLocal(config.claudeReq, config.model as ResponsesModel);
    console.log(
      JSON.stringify(
        {
          instructions: openaiReq.instructions,
          input: openaiReq.input,
          prompt: openaiReq.prompt,
        },
        null,
        2
      )
    );
    logDebug("OpenAI Request Params", openaiReq, { requestId: config.requestId });

    // Tool interception is now handled at the OpenAI client level
    return config.stream
      ? processStreamingResponse(config, openaiReq, c)
      : processNonStreamingResponse(config, openaiReq, c);
  }

  return { process };
}
