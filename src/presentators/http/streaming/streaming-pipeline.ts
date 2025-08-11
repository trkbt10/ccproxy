import { randomUUID } from "node:crypto";
import type { SSEStreamingApi } from "hono/streaming";
import type { ResponseStreamEvent as OpenAIResponseStreamEvent } from "openai/resources/responses/responses";
import { ClaudeSSEWriter } from "./claude-sse-writer";
import { StreamState } from "./stream-state";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";

/**
 * Configuration for streaming pipeline
 */
export interface StreamingPipelineConfig {
  requestId: string;
  logEnabled?: boolean;
}

/**
 * Result from streaming pipeline execution
 */
export interface StreamingPipelineResult {
  responseId?: string;
  callIdManager?: UnifiedIdManager;
}

/**
 * Encapsulates the entire streaming pipeline from OpenAI to Claude SSE.
 * Provides a single, unidirectional flow for stream processing.
 */
export class StreamingPipeline {
  private state: StreamState;
  private sse: ClaudeSSEWriter;
  private pingTimer?: NodeJS.Timeout;
  private completed = false;

  constructor(
    stream: SSEStreamingApi,
    private config: StreamingPipelineConfig
  ) {
    this.sse = new ClaudeSSEWriter(stream);
    this.state = new StreamState(this.sse, config.logEnabled, config.requestId);
  }

  /**
   * Start the pipeline with greeting and ping timer
   */
  async start(): Promise<void> {
    await this.state.greeting();
    this.startPingTimer();
  }

  /**
   * Process a single OpenAI event through the pipeline
   */
  async processEvent(event: OpenAIResponseStreamEvent): Promise<void> {
    if (this.completed) {
      console.warn(
        `[StreamingPipeline] Ignoring event after completion:`,
        event.type
      );
      return;
    }

    await this.state.handleEvent(event);

    if (event.type === "response.completed") {
      this.completed = true;
      console.log(`✅ [Request ${this.config.requestId}] response.completed`);
    }
  }

  /**
   * Check if the client connection is closed
   */
  isClientClosed(): boolean {
    return this.sse.closed;
  }

  /**
   * Check if the pipeline has completed processing
   */
  isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Get the result of the pipeline execution
   */
  getResult(): StreamingPipelineResult {
    return {
      responseId: this.state.getResponseId(),
      callIdManager: this.state.getCallIdManager(),
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopPingTimer();
    this.state.cleanup();
  }

  /**
   * Handle errors by sending SSE error event
   */
  async handleError(error: unknown): Promise<void> {
    console.error(`🔥 [Request ${this.config.requestId}] Stream Error`, error);
    await this.sse.error("api_error", String(error));
  }

  private startPingTimer(intervalMs: number = 15000): void {
    this.pingTimer = setInterval(() => {
      if (!this.sse.closed) {
        this.sse.ping();
      }
    }, intervalMs);
  }

  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }
}

/**
 * Factory function to create and manage streaming pipelines
 */
export class StreamingPipelineFactory {
  private activePipelines = new Map<string, StreamingPipeline>();

  /**
   * Create a new streaming pipeline
   */
  create(
    stream: SSEStreamingApi,
    config: StreamingPipelineConfig
  ): StreamingPipeline {
    if (this.activePipelines.has(config.requestId)) {
      throw new Error(
        `Pipeline already exists for request: ${config.requestId}`
      );
    }

    const pipeline = new StreamingPipeline(stream, config);
    this.activePipelines.set(config.requestId, pipeline);

    console.log(
      `[StreamingPipelineFactory] Created pipeline for request: ${config.requestId}`
    );
    console.log(
      `[StreamingPipelineFactory] Active pipelines: ${this.activePipelines.size}`
    );

    return pipeline;
  }

  /**
   * Release a pipeline when done
   */
  release(requestId: string): void {
    const pipeline = this.activePipelines.get(requestId);
    if (pipeline) {
      pipeline.cleanup();
      this.activePipelines.delete(requestId);

      console.log(
        `[StreamingPipelineFactory] Released pipeline for request: ${requestId}`
      );
      console.log(
        `[StreamingPipelineFactory] Active pipelines: ${this.activePipelines.size}`
      );
    }
  }

  /**
   * Clean up all active pipelines
   */
  cleanupAll(): void {
    console.log(
      `[StreamingPipelineFactory] Cleaning up ${this.activePipelines.size} active pipelines`
    );

    for (const [requestId, pipeline] of this.activePipelines) {
      pipeline.cleanup();
      console.log(
        `[StreamingPipelineFactory] Cleaned up pipeline: ${requestId}`
      );
    }

    this.activePipelines.clear();
  }
}

export const streamingPipelineFactory = new StreamingPipelineFactory();
