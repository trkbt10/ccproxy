import OpenAI from "openai";
import type {
  ResponseCreateParams,
  Response as OpenAIResponse,
} from "openai/resources/responses/responses";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import { streamingPipelineFactory } from "../utils/streaming/streaming-pipeline";
import { convertOpenAIResponseToClaude } from "../converters/message-converter/openai-to-claude/response";
import { conversationStore } from "../utils/conversation/conversation-store";
import { claudeToResponses } from "../converters/message-converter/claude-to-openai/request";
import {
  logError,
  logInfo,
  logDebug,
  logUnexpected,
  logRequestResponse,
  logPerformance,
} from "../utils/logging/migrate-logger";
import type { RoutingConfig } from "../execution/tool-model-planner";

export type ProcessorConfig = {
  requestId: string;
  conversationId: string;
  openai: OpenAI;
  claudeReq: ClaudeMessageCreateParams;
  // Resolved OpenAI model for this request
  model: string;
  stream: boolean;
  signal?: AbortSignal; // Support for request cancellation
  routingConfig?: RoutingConfig;
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
    // Generate debug report for tool output errors
    if (conversationId) {
      const manager = conversationStore.getIdManager(conversationId);
      const debugReport = manager.generateDebugReport();

      logError(
        "Tool output not found - ID mapping debug report",
        new Error(debugReport),
        { ...context, conversationId }
      );
    }

    logUnexpected(
      "Tool output should be found in conversation history",
      "No tool output found error",
      {
        tools: openaiReq.tools?.length,
        input: openaiReq.input,
        errorMessage: error.message,
      },
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
  const context = {
    requestId: config.requestId,
    conversationId: config.conversationId,
    stream: false,
  };

  try {
    logDebug("Starting non-streaming response", { openaiReq }, context);

    // Pass the abort signal to OpenAI API
    const response = await config.openai.responses.create(
      {
        ...openaiReq,
        stream: false,
      },
      config.signal ? { signal: config.signal } : undefined
    );

    // Get the manager for this conversation
    const manager = conversationStore.getIdManager(config.conversationId);

    const { message: claudeResponse, callIdMapping } =
      convertOpenAIResponseToClaude(response, manager);

    // The manager already has the mappings registered inside convertOpenAIResponseToClaude

    conversationStore.updateConversationState({
      conversationId: config.conversationId,
      requestId: config.requestId,
      responseId: response.id,
    });

    const duration = Date.now() - startTime;
    logRequestResponse(openaiReq, response, duration, context);
    logPerformance(
      "non-streaming-response",
      duration,
      { responseId: response.id },
      context
    );

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
      logEnabled: process.env.LOG_EVENTS === "true",
    });

    const context = {
      requestId: config.requestId,
      conversationId: config.conversationId,
      stream: true,
    };
    logDebug("OpenAI Request Params", openaiReq, context);

    try {
      // Pass the abort signal to OpenAI API for streaming
      const openaiStream = await config.openai.responses
        .create(
          {
            ...openaiReq,
            stream: true,
          },
          config.signal ? { signal: config.signal } : undefined
        )
        .catch(async (error) => {
          // Check if error is due to abort
          if (config.signal?.aborted || error.name === "AbortError") {
            logInfo("Request was aborted by client", undefined, context);
            await pipeline.cleanup();
            throw new Error("Request cancelled by client");
          }
          handleError(
            config.requestId,
            openaiReq,
            error,
            config.conversationId
          );
          throw error;
        });

      await pipeline.start();

      for await (const event of openaiStream) {
        // Check for abort signal
        if (config.signal?.aborted) {
          logInfo("Request aborted during streaming", undefined, context);
          await pipeline.cleanup();
          break;
        }

        await pipeline.processEvent(event);

        if (pipeline.isCompleted()) {
          logInfo("Response completed, breaking loop", undefined, context);
          break;
        }
        if (pipeline.isClientClosed()) {
          logInfo("Client closed connection", undefined, context);
          break;
        }
      }

      logDebug("Stream processing loop exited", undefined, context);

      const result = pipeline.getResult();

      // Register mappings in centralized manager
      const manager = conversationStore.getIdManager(config.conversationId);
      if (result.callIdMapping) {
        manager.importFromMap(result.callIdMapping, {
          source: "streaming-response",
        });
      }

      conversationStore.updateConversationState({
        conversationId: config.conversationId,
        requestId: config.requestId,
        responseId: result.responseId,
      });
    } catch (err) {
      await pipeline.handleError(err);
    } finally {
      streamingPipelineFactory.release(config.requestId);
      logDebug("Cleanup complete", undefined, context);
    }
  });
}

export const createResponseProcessor = (config: ProcessorConfig) => {
  // Get conversation context
  const context = conversationStore.getConversationContext(
    config.conversationId
  );

  // Get or create centralized manager for this conversation
  const manager = conversationStore.getIdManager(config.conversationId);

  // Convert Claude request to OpenAI format
  const openaiReq = claudeToResponses(
    config.claudeReq,
    () => config.model,
    manager,
    context.lastResponseId,
    config.routingConfig
  );

  // Session-use semantics: drop mappings that were consumed while building this request
  const purged = manager.purgeUsed(0);
  if (purged > 0) {
    logDebug(
      "Purged used call_id mappings after request conversion",
      { purged },
      { requestId: config.requestId, conversationId: config.conversationId }
    );
  }

  if (context.lastResponseId) {
    logDebug(
      "Using previous_response_id",
      { previousResponseId: context.lastResponseId },
      { requestId: config.requestId, conversationId: config.conversationId }
    );
  }

  // Return the processor function
  return {
    process: (c: Context): Promise<Response> => {
      return config.stream
        ? processStreamingResponse(config, openaiReq, c)
        : processNonStreamingResponse(config, openaiReq, c);
    },
  };
};
