import { randomUUID } from "node:crypto";
import type { ClaudeSSEWriter } from "./claude-sse-writer";
import { ContentBlockManager } from "../../../utils/streaming/content-block-manager";
import { logUnexpected, logDebug, logWarn, logInfo } from "../../../utils/logging/migrate-logger";
import type { LogContext } from "../../../utils/logging/enhanced-logger";
import { getMetadataHandler } from "./metadata-handler";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";
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
  private callIdManager: UnifiedIdManager = new UnifiedIdManager();
  private requestId?: string;
  private metadataHandler = getMetadataHandler(this.requestId || "unknown");

  constructor(private sse: ClaudeSSEWriter, logEnabled: boolean = false, requestId?: string) {
    this.messageId = randomUUID();
    this.requestId = requestId;
  }

  private getLogContext(): LogContext {
    return { requestId: this.requestId, messageId: this.messageId };
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
      if (!this.sse.closed) this.sse.ping();
    }, intervalMs);
  }

  cleanup() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  async handleEvent(ev: OpenAIResponseStreamEvent) {
    if (this.streamCompleted) {
      logWarn("Ignoring event after stream completed", { eventType: ev.type }, this.getLogContext());
      return;
    }
    logDebug("stream_event", ev, this.getLogContext());
    switch (ev.type) {
      case "response.created": {
        const createdEvent = ev as ResponseCreatedEvent;
        if (createdEvent.response?.id) {
          this.responseId = createdEvent.response.id;
          logInfo(`Captured response ID: ${this.responseId}`, undefined, this.getLogContext());
        }
        return;
      }
      case "response.output_text.delta": {
        const currentBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (currentBlockResult) {
          await this.sse.deltaText(currentBlockResult.metadata.index, ev.delta);
          this.contentManager.updateTextContent(currentBlockResult.metadata.id, ev.delta);
        }
        break;
      }
      case "response.output_text.done": {
        const doneBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (doneBlockResult) {
          await this.sse.textStop(doneBlockResult.metadata.index);
          this.contentManager.markCompleted(doneBlockResult.metadata.id);
        }
        this.currentTextBlockId = undefined;
        break;
      }
      case "response.output_item.added": {
        if ((ev as any).item?.type === "function_call" && this.isItemIdString(ev as any)) {
          logDebug(
            "function_call event",
            { id: (ev as any).item.id, call_id: (ev as any).item.call_id, name: (ev as any).item.name, type: (ev as any).item.type },
            this.getLogContext()
          );
          const { metadata: toolMeta } = this.contentManager.addToolBlock((ev as any).item.id, (ev as any).item.name, (ev as any).item.call_id);
          if ((ev as any).item.call_id) {
            this.callIdManager.addMapping((ev as any).item.call_id, (ev as any).item.id, {
              source: "stream-state",
              operation: "handleFunctionCall"
            });
            logDebug(`Stored mapping: call_id ${(ev as any).item.call_id} -> tool_use_id ${(ev as any).item.id}`, undefined, this.getLogContext());
          }
          if (!toolMeta.started) {
            await this.sse.toolStart(toolMeta.index, { id: (ev as any).item.id, name: (ev as any).item.name });
            this.contentManager.markStarted(toolMeta.id);
          }
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const toolBlockResult = this.contentManager.getToolBlock(ev.item_id);
        if (toolBlockResult && !toolBlockResult.metadata.completed) {
          toolBlockResult.metadata.argsBuffer = (toolBlockResult.metadata.argsBuffer || "") + ev.delta;
          await this.sse.toolArgsDelta(toolBlockResult.metadata.index, ev.delta);
        }
        break;
      }
      case "response.output_item.done": {
        if ((ev as any).item?.type === "function_call" && this.isItemIdString(ev as any)) {
          const toolBlockResult = this.contentManager.getToolBlock((ev as any).item.id);
          if (toolBlockResult && !toolBlockResult.metadata.completed) {
            await this.sse.toolStop(toolBlockResult.metadata.index);
            this.contentManager.markCompleted(toolBlockResult.metadata.id);
          }
        }
        break;
      }
      case "response.content_part.added": {
        const contentAddedEvent = ev as ResponseContentPartAddedEvent;
        logDebug(`content_part.added: type=${contentAddedEvent.part.type}, item_id=${contentAddedEvent.item_id}, content_index=${contentAddedEvent.content_index}`,
          contentAddedEvent, this.getLogContext());
        if (contentAddedEvent.item_id) {
          this.responseId = contentAddedEvent.item_id;
          logInfo(`Captured response ID: ${this.responseId}`, undefined, this.getLogContext());
        }
        if (contentAddedEvent.part.type === "output_text" && contentAddedEvent.part.text) {
          const textContent = contentAddedEvent.part.text.trim();
          if (textContent && this.metadataHandler.isMetadata(textContent)) {
            const result = this.metadataHandler.processMetadata(textContent, contentAddedEvent.item_id);
            logDebug("Detected metadata JSON in content_part.added", { metadata: result.metadata, item_id: contentAddedEvent.item_id }, { requestId: this.requestId });
          }
        }
        break;
      }
      case "response.content_part.done": {
        const contentDoneEvent = ev as ResponseContentPartDoneEvent;
        logDebug(`content_part.done: type=${contentDoneEvent.part.type}, item_id=${contentDoneEvent.item_id}`, contentDoneEvent, this.getLogContext());
        break;
      }
      case "response.completed": {
        this.streamCompleted = true;
        const resp: any = (ev as any).response;
        if (resp?.usage?.output_tokens) this.usage.output_tokens = resp.usage.output_tokens;
        if (resp?.usage?.input_tokens) this.usage.input_tokens = resp.usage.input_tokens;
        await this.sse.messageStop(this.usage);
        await this.sse.done();
        break;
      }
      case "response.web_search_call.in_progress": {
        const e = ev as any as ResponseWebSearchCallInProgressEvent;
        logDebug("web_search_call.in_progress", { query: (e as any).query }, this.getLogContext());
        break;
      }
      case "response.web_search_call.searching": {
        const e = ev as any as ResponseWebSearchCallSearchingEvent;
        logDebug("web_search_call.searching", { query: (e as any).query }, this.getLogContext());
        break;
      }
      case "response.web_search_call.completed": {
        const e = ev as any as ResponseWebSearchCallCompletedEvent;
        logDebug("web_search_call.completed", { query: (e as any).query, result_count: (e as any).result_count }, this.getLogContext());
        break;
      }
      default:
        logUnexpected("Unhandled event type", ev.type, {}, this.getLogContext());
    }
  }

  getResponseId(): string | undefined {
    return this.responseId;
  }

  getCallIdManager(): UnifiedIdManager {
    return this.callIdManager;
  }

  private isItemIdString(ev: any): ev is { item: { id: string } } {
    return typeof ev?.item?.id === "string";
  }
}
