import { randomUUID } from "node:crypto";
import type { ClaudeSSEWriter } from "./claude-sse-writer";
import { ContentBlockManager } from "./content-block-manager";
import { logUnexpected, logDebug, logWarn, logInfo } from "../logging/migrate-logger";
import type { LogContext } from "../logging/enhanced-logger";
import { getMetadataHandler } from "./metadata-handler";
import type {
  ResponseStreamEvent as OpenAIResponseStreamEvent,
  ResponseOutputItemAddedEvent as OpenAIResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent as OpenAIResponseOutputItemDoneEvent,
  ResponseWebSearchCallInProgressEvent,
  ResponseWebSearchCallSearchingEvent,
  ResponseWebSearchCallCompletedEvent,
  ResponseCreatedEvent,
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
} from "openai/resources/responses/responses";

export class StreamState {
  private usage = { input_tokens: 0, output_tokens: 0 };
  private contentManager = new ContentBlockManager();
  private messageId: string;
  private messageStarted = false;
  private responseId?: string;
  private pingTimer?: NodeJS.Timeout;
  private streamCompleted = false;
  private currentTextBlockId?: string;
  private callIdMapping: Map<string, string> = new Map(); // Maps OpenAI call_id to Claude tool_use_id
  private requestId?: string;
  private metadataHandler = getMetadataHandler(this.requestId || "unknown");
  // Tool chain validation removed; keep mapping-only behavior

  constructor(
    private sse: ClaudeSSEWriter,
    logEnabled: boolean = false,
    requestId?: string
  ) {
    this.messageId = randomUUID();
    this.requestId = requestId;
  }

  private getLogContext(): LogContext {
    return {
      requestId: this.requestId,
      messageId: this.messageId,
    };
  }

  async greeting() {
    if (!this.messageStarted) {
      await this.sse.messageStart(this.messageId);
      await this.sse.ping();
      this.messageStarted = true;
    }
  }

  startPingTimer(intervalMs: number = 15000) {
    this.pingTimer = setInterval(() => {
      if (!this.sse.closed) {
        this.sse.ping();
      }
    }, intervalMs);
  }

  cleanup() {
    // Stop ping timer
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    // Future cleanup tasks can be added here
  }

  async handleEvent(ev: OpenAIResponseStreamEvent) {
    // Ignore events after stream is completed
    if (this.streamCompleted) {
      logWarn(
        "Ignoring event after stream completed",
        { eventType: ev.type },
        this.getLogContext()
      );
      return;
    }

    logDebug("stream_event", ev, this.getLogContext());

    switch (ev.type) {
      case "response.created":
        // Capture the response ID for future requests
        const createdEvent = ev as ResponseCreatedEvent;
        if (createdEvent.response?.id) {
          this.responseId = createdEvent.response.id;
          logInfo(`Captured response ID: ${this.responseId}`, undefined, this.getLogContext());
        }
        // Do not pre-create a text block here; wait until real content arrives
        // via output_text.delta or content_part.added to avoid empty/duplicate blocks.
        return;

      case "response.output_text.delta":
        const currentBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (currentBlockResult) {
          await this.sse.deltaText(currentBlockResult.metadata.index, ev.delta);
          this.contentManager.updateTextContent(currentBlockResult.metadata.id, ev.delta);
        }
        break;

      case "response.output_text.done":
        const doneBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (doneBlockResult) {
          await this.sse.textStop(doneBlockResult.metadata.index);
          this.contentManager.markCompleted(doneBlockResult.metadata.id);
        }
        this.currentTextBlockId = undefined;
        break;

      case "response.output_item.added":
        if (ev.item.type === "function_call" && this.isItemIdString(ev)) {
          logDebug("function_call event", {
            id: ev.item.id,
            call_id: ev.item.call_id,
            name: ev.item.name,
            type: ev.item.type
          }, this.getLogContext());
          
          const { block: toolBlock, metadata: toolMeta } = this.contentManager.addToolBlock(
            ev.item.id,
            ev.item.name,
            ev.item.call_id
          );
          
          // Store the mapping from call_id to tool_use_id
          if (ev.item.call_id) {
            this.callIdMapping.set(ev.item.call_id, ev.item.id);
            logDebug(`Stored mapping: call_id ${ev.item.call_id} -> tool_use_id ${ev.item.id}`, undefined, this.getLogContext());
          }
          
          if (!toolMeta.started) {
            await this.sse.toolStart(toolMeta.index, {
              id: ev.item.id,
              name: ev.item.name,
            });
            this.contentManager.markStarted(toolMeta.id);
          }
        }
        break;

      case "response.function_call_arguments.delta":
        const toolBlockResult = this.contentManager.getToolBlock(ev.item_id);
        if (toolBlockResult && !toolBlockResult.metadata.completed) {
          toolBlockResult.metadata.argsBuffer = (toolBlockResult.metadata.argsBuffer || "") + ev.delta;
          await this.sse.toolArgsDelta(toolBlockResult.metadata.index, ev.delta);
        }
        break;

      case "response.output_item.done":
        if (ev.item.type === "function_call" && this.isItemIdString(ev)) {
          const toolBlockResult = this.contentManager.getToolBlock(ev.item.id);
          if (toolBlockResult && !toolBlockResult.metadata.completed) {
            await this.sse.toolStop(toolBlockResult.metadata.index);
            this.contentManager.markCompleted(toolBlockResult.metadata.id);
          }
        }
        break;

      case "response.content_part.added":
        // Content parts are complete content items (not deltas)
        // They seem to be sent in addition to the delta events
        // Log for now to understand the flow better
        const contentAddedEvent = ev as ResponseContentPartAddedEvent;
        logDebug(
          `content_part.added: type=${contentAddedEvent.part.type}, item_id=${contentAddedEvent.item_id}, content_index=${contentAddedEvent.content_index}`,
          contentAddedEvent,
          this.getLogContext()
        );
        if (contentAddedEvent.item_id) {
          this.responseId = contentAddedEvent.item_id;
          logInfo(`Captured response ID: ${this.responseId}`, undefined, this.getLogContext());
        }
        
        // Check if this might be metadata JSON (though usually empty at this stage)
        if (contentAddedEvent.part.type === "output_text" && contentAddedEvent.part.text) {
          const textContent = contentAddedEvent.part.text.trim();
          if (textContent && this.metadataHandler.isMetadata(textContent)) {
            const result = this.metadataHandler.processMetadata(
              textContent,
              contentAddedEvent.item_id
            );
            logDebug(
              "Detected metadata JSON in content_part.added",
              { metadata: result.metadata, item_id: contentAddedEvent.item_id },
              { requestId: this.requestId }
            );
            // Continue to process and forward the metadata
          }
        }
        
        // Create a text block only when content arrives
        const { metadata: newTextMeta } = this.contentManager.addTextBlock();
        this.currentTextBlockId = newTextMeta.id;
        await this.sse.textStart(newTextMeta.index);
        this.contentManager.markStarted(newTextMeta.id);
        if (contentAddedEvent.part.type === "output_text" && contentAddedEvent.part.text) {
          await this.sse.deltaText(newTextMeta.index, contentAddedEvent.part.text);
          this.contentManager.updateTextContent(newTextMeta.id, contentAddedEvent.part.text);
        }

        break;

      case "response.content_part.done": {
        // Log to understand the flow
        const contentDoneEvent = ev as ResponseContentPartDoneEvent;
        logDebug(
          `content_part.done: type=${contentDoneEvent.part.type}, item_id=${contentDoneEvent.item_id}, content_index=${contentDoneEvent.content_index}`,
          contentDoneEvent,
          this.getLogContext()
        );
        
        // Check if the text is metadata - but still forward it to Claude
        if (contentDoneEvent.part.type === "output_text" && contentDoneEvent.part.text) {
          const textContent = contentDoneEvent.part.text.trim();
          if (this.metadataHandler.isMetadata(textContent)) {
            const result = this.metadataHandler.processMetadata(
              textContent,
              contentDoneEvent.item_id
            );
            
            // Log that we detected metadata but will forward it
            logDebug(
              "Forwarding conversation metadata to Claude",
              { metadata: result.metadata, item_id: contentDoneEvent.item_id },
              { requestId: this.requestId }
            );
            
            // Continue to forward the metadata to Claude as-is
            // Claude will handle it appropriately
          }
        }
        
        const textBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (textBlockResult) {
          // Do not append content again on 'done'; it was already sent in 'added' or via deltas
          await this.sse.textStop(textBlockResult.metadata.index);
          this.contentManager.markCompleted(textBlockResult.metadata.id);
        }
        this.currentTextBlockId = undefined;
        break;
      }

      case "response.function_call_arguments.done":
        const doneToolBlockResult = this.contentManager.getToolBlock(ev.item_id);
        if (doneToolBlockResult && !doneToolBlockResult.metadata.completed) {
          // Don't mark as completed here - wait for output_item.done
          logDebug(
            `Tool args done for: ${doneToolBlockResult.block.name}`,
            undefined,
            this.getLogContext()
          );
        }
        break;

      case "response.completed":
        // Stop any uncompleted blocks
        const uncompletedBlocks = this.contentManager.getUncompletedBlocks();
        for (const { block, metadata } of uncompletedBlocks) {
          if (block.type === "text") {
            await this.sse.textStop(metadata.index);
          } else if (block.type === "tool_use") {
            await this.sse.toolStop(metadata.index);
          }
          this.contentManager.markCompleted(metadata.id);
        }

        const hasActiveTool = this.contentManager.hasActiveTools();
        let stopReason: "end_turn" | "max_tokens" | "tool_use";
        const status = ev.response.status;
        const detail = ev.response.incomplete_details?.reason;
        if (status === "incomplete" && detail === "max_output_tokens") {
          stopReason = "max_tokens";
        } else if (hasActiveTool) {
          stopReason = "tool_use";
        } else {
          stopReason = "end_turn";
        }

        this.sse.messageDelta(
          { stop_reason: stopReason, stop_sequence: null },
          {
            ...this.usage,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
          }
        );

        this.sse.messageStop();
        this.streamCompleted = true;
        break;

      case "response.failed":
      case "response.incomplete":
      case "error":
        this.sse.error(ev.type, "Stream error");
        break;

      case "response.in_progress":
        this.sse.ping();
        break;

      case "response.web_search_call.in_progress": {
        // Represent web search progress using a dedicated web_search_tool_result block
        const webSearchInProgress = ev as ResponseWebSearchCallInProgressEvent;
        const { block, metadata } = this.contentManager.addWebSearchToolResultBlock(
          webSearchInProgress.item_id,
          webSearchInProgress.item_id
        );
        if (!metadata.started) {
          await this.sse.webSearchResultStart(metadata.index, webSearchInProgress.item_id);
          this.contentManager.markStarted(metadata.id);
        }
        logDebug(
          "web_search_call.in_progress received",
          { item_id: webSearchInProgress.item_id },
          { requestId: this.requestId }
        );
        break;
      }

      case "response.web_search_call.searching": {
        const webSearchSearching = ev as ResponseWebSearchCallSearchingEvent;
        const resultBlock = this.contentManager.getWebSearchToolResultBlock(
          webSearchSearching.item_id
        );
        if (resultBlock && !resultBlock.metadata.completed) {
          const searchingData = JSON.stringify({
            status: "searching",
            sequence: webSearchSearching.sequence_number,
          });
          await this.sse.webSearchResultDelta(resultBlock.metadata.index, searchingData);
        }
        logDebug(
          "web_search_call.searching received",
          { item_id: webSearchSearching.item_id, seq: webSearchSearching.sequence_number },
          { requestId: this.requestId }
        );
        break;
      }

      case "response.web_search_call.completed": {
        const webSearchCompleted = ev as ResponseWebSearchCallCompletedEvent;
        const resultBlock = this.contentManager.getWebSearchToolResultBlock(
          webSearchCompleted.item_id
        );
        if (resultBlock && !resultBlock.metadata.completed) {
          await this.sse.webSearchResultStop(resultBlock.metadata.index);
          this.contentManager.markCompleted(resultBlock.metadata.id);
        }
        logDebug(
          "web_search_call.completed received",
          { item_id: webSearchCompleted.item_id },
          { requestId: this.requestId }
        );
        break;
      }

      default:
        logWarn("Unknown event type", { type: ev.type }, this.getLogContext());
        break;
    }
  }

  private isItemIdString(
    ev: OpenAIResponseOutputItemAddedEvent | OpenAIResponseOutputItemDoneEvent
  ): ev is (
    | OpenAIResponseOutputItemAddedEvent
    | OpenAIResponseOutputItemDoneEvent
  ) & { item: { id: string } } {
    return typeof ev.item.id === "string";
  }

  /**
   * Get the response ID (if captured)
   */
  getResponseId(): string | undefined {
    return this.responseId;
  }

  getCallIdMapping(): Map<string, string> {
    return new Map(this.callIdMapping);
  }

  /**
   * Get current usage statistics
   */
  getUsage(): { input_tokens: number; output_tokens: number } {
    return { ...this.usage };
  }

  /**
   * Check if the stream is completed
   */
  isCompleted(): boolean {
    return this.streamCompleted;
  }
}
