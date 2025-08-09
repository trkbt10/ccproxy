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
import { logError, logInfo, logDebug, logUnexpected, logRequestResponse, logPerformance } from "../utils/logging/migrate-logger";
import { unifiedIdRegistry as callIdRegistry } from "../utils/id-management/unified-id-manager";

export type ProcessorConfig = {
  requestId: string;
  conversationId: string;
  openai: OpenAI;
  claudeReq: ClaudeMessageCreateParams;
  modelResolver: (model: ClaudeMessageCreateParams['model']) => string;
  stream: boolean;
  signal?: AbortSignal; // Support for request cancellation
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
    let debugReport = "";
    if (conversationId) {
      const manager = callIdRegistry.getManager(conversationId);
      debugReport = manager.generateDebugReport();
      
      // Save debug report to file
      const fs = require("fs");
      const path = require("path");
      const debugDir = path.join(process.cwd(), "logs", "debug");
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const filename = `callid-debug-${conversationId}-${Date.now()}.txt`;
      fs.writeFileSync(path.join(debugDir, filename), debugReport);
      
      console.error(`[ERROR] Debug report saved to: logs/debug/${filename}`);
    }
    
    logUnexpected(
      "Tool output should be found in conversation history",
      "No tool output found error",
      {
        tools: openaiReq.tools?.length,
        input: openaiReq.input,
        errorMessage: error.message,
        debugReportSaved: !!debugReport,
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
    stream: false 
  };
  
  try {
    logDebug("Starting non-streaming response", { openaiReq }, context);
    
    // Pass the abort signal to OpenAI API
    const response = await config.openai.responses.create({
      ...openaiReq,
      stream: false,
    }, config.signal ? { signal: config.signal } : undefined);

    // Get the manager for this conversation
    const manager = callIdRegistry.getManager(config.conversationId);
    
    const { message: claudeResponse, callIdMapping } =
      convertOpenAIResponseToClaude(response, manager);

    // The manager already has the mappings registered inside convertOpenAIResponseToClaude

    conversationStore.updateConversationState({
      conversationId: config.conversationId,
      requestId: config.requestId,
      responseId: response.id,
      callIdMapping: manager.getMappingAsMap(),
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
    const pipeline = streamingPipelineFactory.create(stream, {
      requestId: config.requestId,
      logEnabled: process.env.LOG_EVENTS === "true",
    });

    const context = { 
      requestId: config.requestId, 
      conversationId: config.conversationId,
      stream: true 
    };
    logDebug("OpenAI Request Params", openaiReq, context);

    try {
      // Pass the abort signal to OpenAI API for streaming
      const openaiStream = await config.openai.responses
        .create({
          ...openaiReq,
          stream: true,
        }, config.signal ? { signal: config.signal } : undefined)
        .catch(async (error) => {
          // Check if error is due to abort
          if (config.signal?.aborted || error.name === 'AbortError') {
            logInfo("Request was aborted by client", undefined, context);
            await pipeline.cleanup();
            throw new Error('Request cancelled by client');
          }
          handleError(config.requestId, openaiReq, error, config.conversationId);
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
      const manager = callIdRegistry.getManager(config.conversationId);
      if (result.callIdMapping) {
        manager.importFromMap(result.callIdMapping, { source: "streaming-response" });
      }
      
      conversationStore.updateConversationState({
        conversationId: config.conversationId,
        requestId: config.requestId,
        responseId: result.responseId,
        callIdMapping: manager.getMappingAsMap(),
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
  const context = conversationStore.getConversationContext(config.conversationId);

  // Get or create centralized manager for this conversation
  const manager = callIdRegistry.getManager(config.conversationId);
  
  // Import existing mappings if available
  if (context.callIdMapping && context.callIdMapping.size > 0) {
    manager.importFromMap(context.callIdMapping, { source: "conversation-context" });
    logDebug(
      "Imported existing call_id mappings to manager",
      { count: context.callIdMapping.size, stats: manager.getStats() },
      { requestId: config.requestId, conversationId: config.conversationId }
    );
  }

  // Convert Claude request to OpenAI format
  const openaiReq = claudeToResponses(
    config.claudeReq,
    config.modelResolver,
    context.lastResponseId,
    manager
  );

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