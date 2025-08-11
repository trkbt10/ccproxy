import type { OpenAICompatibleClient } from "../../../adapters/providers/openai-compat/types";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { streamingPipelineFactory } from "../streaming/streaming-pipeline";
import { convertOpenAIResponseToClaude } from "../../../adapters/message-converter/openai-to-claude/response";
import { conversationStore } from "../../../utils/conversation/conversation-store";
import { claudeToResponses } from "../../../adapters/message-converter/claude-to-openai/request";
import type { ResponsesModel as OpenAIResponseModel } from "openai/resources/shared";
import {
  logError,
  logInfo,
  logDebug,
  logUnexpected,
  logRequestResponse,
  logPerformance,
} from "../../../utils/logging/migrate-logger";
import type { RoutingConfig } from "../../../config/types";

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

export type ProcessorResult = {
  responseId?: string;
  callIdMapping?: Map<string, string>;
};

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
    if (conversationId) {
      const manager = conversationStore.getIdManager(conversationId);
      const debugReport = manager.generateDebugReport();
      logError("Tool output not found - ID mapping debug report", new Error(debugReport), { ...context, conversationId });
    }

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
    const respOrStream = await config.openai.responses.create({ ...openaiReq, stream: false }, config.signal ? { signal: config.signal } : undefined);
    function isOpenAIResponse(v: unknown): v is OpenAIResponse {
      return typeof v === "object" && v !== null && "object" in (v as Record<string, unknown>) && (v as { object?: unknown }).object === "response";
    }
    if (!isOpenAIResponse(respOrStream)) throw new Error("Expected non-streaming OpenAI response shape");
    const response = respOrStream;

    const manager = conversationStore.getIdManager(config.conversationId);
    const { message: claudeResponse } = convertOpenAIResponseToClaude(response, manager);

    conversationStore.updateConversationState({ conversationId: config.conversationId, requestId: config.requestId, responseId: response.id });

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
    const pipeline = streamingPipelineFactory.create(stream, {
      requestId: config.requestId,
      logEnabled: config.routingConfig?.logging?.eventsEnabled === true,
    });

    const context = { requestId: config.requestId, conversationId: config.conversationId, stream: true };
    logDebug("OpenAI Request Params", openaiReq, context);

    try {
      await pipeline.start();

      const streamOrResp = await config.openai.responses
        .create({ ...openaiReq, stream: true }, config.signal ? { signal: config.signal } : undefined)
        .catch(async (error) => {
          if (config.signal?.aborted || (error as Error).name === "AbortError") {
            logInfo("Request was aborted by client", undefined, context);
            streamingPipelineFactory.release(config.requestId);
            throw new Error("Request cancelled by client");
          }
          handleError(config.requestId, openaiReq, error, config.conversationId);
          streamingPipelineFactory.release(config.requestId);
          throw error;
        });

      function isResponseEventStream(v: unknown): v is AsyncIterable<ResponseStreamEvent> {
        return typeof v === "object" && v !== null && Symbol.asyncIterator in (v as Record<string, unknown>);
      }

      if (!isResponseEventStream(streamOrResp)) throw new Error("Expected streaming OpenAI response event stream");

      for await (const event of streamOrResp) {
        await pipeline.processEvent(event);
        if (pipeline.isClientClosed()) break;
      }

      streamingPipelineFactory.release(config.requestId);
    } catch (error) {
      const isAbort = (error as Error)?.message === "Request cancelled by client" || config.signal?.aborted;
      if (!isAbort) {
        await pipeline.handleError(error);
        handleError(config.requestId, openaiReq, error, config.conversationId);
      }
      streamingPipelineFactory.release(config.requestId);
      throw error;
    }
  });
}

export function createResponseProcessor(cfg: ProcessorConfig) {
  const manager = conversationStore.getIdManager(cfg.conversationId);
  const modelResolver = () => cfg.model as OpenAIResponseModel;
  const openaiReq: ResponseCreateParams = claudeToResponses(
    cfg.claudeReq,
    modelResolver,
    manager,
    undefined,
    cfg.routingConfig,
    cfg.providerId
  );
  return {
    async process(c: Context): Promise<Response> {
      if (cfg.stream) {
        return processStreamingResponse(cfg, openaiReq, c);
      }
      return processNonStreamingResponse(cfg, openaiReq, c);
    },
  };
}
