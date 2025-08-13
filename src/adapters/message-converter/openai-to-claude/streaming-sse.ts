import { ContentBlockManager } from "./content-block-manager";
import { toClaudeToolUseIdFromOpenAI } from "../../../utils/conversation/id-conversion";
import { logDebug, logInfo, logUnexpected, logWarn } from "../../../utils/logging/migrate-logger";
import type {
  ResponseStreamEvent as OpenAIResponseStreamEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseWebSearchCallInProgressEvent,
  ResponseWebSearchCallSearchingEvent,
  ResponseWebSearchCallCompletedEvent,
  ResponseCreatedEvent,
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
  ResponseCompletedEvent,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";

export interface ClaudeSSESink {
  write(event: string, payload: unknown): Promise<void>;
}

// Type guards reused locally
function isFunctionCallItem(item: any): item is ResponseFunctionToolCall & { id: string } {
  return (
    item?.type === "function_call" &&
    typeof item?.id === "string" &&
    typeof item?.call_id === "string" &&
    typeof item?.name === "string"
  );
}
function isResponseCompletedEvent(ev: OpenAIResponseStreamEvent): ev is ResponseCompletedEvent {
  return ev.type === "response.completed";
}
function isResponseOutputItemAddedEvent(ev: OpenAIResponseStreamEvent): ev is ResponseOutputItemAddedEvent {
  return ev.type === "response.output_item.added";
}
function isResponseOutputItemDoneEvent(ev: OpenAIResponseStreamEvent): ev is ResponseOutputItemDoneEvent {
  return ev.type === "response.output_item.done";
}
function isWebSearchInProgressEvent(ev: OpenAIResponseStreamEvent): ev is ResponseWebSearchCallInProgressEvent {
  return ev.type === "response.web_search_call.in_progress";
}
function isWebSearchSearchingEvent(ev: OpenAIResponseStreamEvent): ev is ResponseWebSearchCallSearchingEvent {
  return ev.type === "response.web_search_call.searching";
}
function isWebSearchCompletedEvent(ev: OpenAIResponseStreamEvent): ev is ResponseWebSearchCallCompletedEvent {
  return ev.type === "response.web_search_call.completed";
}

export class OpenAIToClaudeSSEStream {
  private sink: ClaudeSSESink;
  private contentManager = new ContentBlockManager();
  private responseId?: string;
  private pingTimer?: NodeJS.Timeout;
  private completed = false;
  private currentTextBlockId?: string;
  private usage = { input_tokens: 0, output_tokens: 0 };

  constructor(
    sink: ClaudeSSESink,
    private conversationId: string,
    private requestId?: string,
    private logEnabled: boolean = false
  ) {
    this.sink = sink;
  }

  async start(messageId: string): Promise<void> {
    logInfo(`Starting SSE stream with messageId: ${messageId}`, {}, { requestId: this.requestId });
    await this.send("message_start", {
      type: "message_start",
      message: {
        type: "message",
        id: messageId,
        role: "assistant",
        content: [],
        model: "claude-3-5-sonnet-20241022",
        stop_reason: null,
        stop_sequence: null,
        usage: {
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          input_tokens: 0,
          output_tokens: 0,
          server_tool_use: null,
          service_tier: null,
        },
      },
    });
    await this.ping();
    this.pingTimer = setInterval(() => {
      this.ping();
    }, 15000);
  }

  // Sink helpers
  private async send(event: string, payload: unknown): Promise<void> {
    if (this.logEnabled) {
      logDebug(`Sending SSE event: ${event}`, { event, payload }, { requestId: this.requestId });
    }
    await this.sink.write(event, payload);
  }
  private async textStart(index: number) {
    await this.send("content_block_start", {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "", citations: [] },
    });
  }
  private async deltaText(index: number, delta: string) {
    await this.send("content_block_delta", {
      type: "content_block_delta",
      index,
      delta: { type: "text_delta", text: delta },
    });
  }
  private async textStop(index: number) {
    await this.send("content_block_stop", { type: "content_block_stop", index });
  }
  private async toolStart(index: number, item: { id: string; name: string; input?: unknown }) {
    await this.send("content_block_start", {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id: item.id, name: item.name, input: item.input ?? {} },
    });
  }
  private async toolArgsDelta(index: number, partialJson: string) {
    await this.send("content_block_delta", {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partialJson },
    });
  }
  private async toolStop(index: number) {
    await this.send("content_block_stop", { type: "content_block_stop", index });
  }
  private async messageStop() {
    await this.send("message_stop", { type: "message_stop" });
  }
  private async ping() {
    await this.sink.write("ping", {});
  }
  private async done() {
    await this.sink.write("done", {});
  }
  public async error(type: string, message: string) {
    await this.send("error", { type, message });
  }

  async processEvent(ev: OpenAIResponseStreamEvent): Promise<void> {
    if (this.completed) return;
    if (this.logEnabled) logDebug("stream_event", ev, { requestId: this.requestId });

    switch (ev.type) {
      case "response.created": {
        const createdEvent = ev as ResponseCreatedEvent;
        if (createdEvent.response?.id) {
          this.responseId = createdEvent.response.id;
          logInfo(`Captured response ID: ${this.responseId}`, undefined, { requestId: this.requestId });
        }
        return;
      }
      case "response.output_text.delta": {
        const currentBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (currentBlockResult) {
          const delta = (ev as any).delta || (ev as any).text;
          await this.deltaText(currentBlockResult.metadata.index, delta);
          this.contentManager.updateTextContent(currentBlockResult.metadata.id, delta);
        } else {
          // Create a new text block if none exists
          const { metadata } = this.contentManager.addTextBlock();
          await this.textStart(metadata.index);
          this.contentManager.markStarted(metadata.id);
          this.currentTextBlockId = metadata.id;
          const delta = (ev as any).delta || (ev as any).text;
          await this.deltaText(metadata.index, delta);
          this.contentManager.updateTextContent(metadata.id, delta);
        }
        break;
      }
      case "response.output_text.done": {
        const doneBlockResult = this.currentTextBlockId
          ? this.contentManager.getBlock(this.currentTextBlockId)
          : this.contentManager.getCurrentTextBlock();
        if (doneBlockResult) {
          await this.textStop(doneBlockResult.metadata.index);
          this.contentManager.markCompleted(doneBlockResult.metadata.id);
        }
        this.currentTextBlockId = undefined;
        break;
      }
      case "response.output_item.added": {
        if (isResponseOutputItemAddedEvent(ev) && isFunctionCallItem(ev.item)) {
          const item = ev.item;
          logDebug(
            "function_call event",
            { id: item.id, call_id: item.call_id, name: item.name, type: item.type },
            { requestId: this.requestId }
          );
          // Derive a Claude tool_use_id deterministically from the OpenAI call_id
          const claudeToolUseId = toClaudeToolUseIdFromOpenAI(item.call_id);
          const { metadata: toolMeta } = this.contentManager.addToolBlock(claudeToolUseId, item.name, item.call_id);
          if (!toolMeta.started) {
            await this.toolStart(toolMeta.index, { id: claudeToolUseId, name: item.name });
            this.contentManager.markStarted(toolMeta.id);
          }
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const toolBlockResult = this.contentManager.getToolBlock(ev.item_id);
        if (toolBlockResult && !toolBlockResult.metadata.completed) {
          toolBlockResult.metadata.argsBuffer = (toolBlockResult.metadata.argsBuffer || "") + ev.delta;
          await this.toolArgsDelta(toolBlockResult.metadata.index, ev.delta);
        }
        break;
      }
      case "response.output_item.done": {
        if (isResponseOutputItemDoneEvent(ev) && isFunctionCallItem(ev.item)) {
          const item = ev.item;
          const toolBlockResult = this.contentManager.getToolBlock(item.id);
          if (toolBlockResult && !toolBlockResult.metadata.completed) {
            await this.toolStop(toolBlockResult.metadata.index);
            this.contentManager.markCompleted(toolBlockResult.metadata.id);
          }
        }
        break;
      }
      case "response.content_part.added": {
        const contentAddedEvent = ev as ResponseContentPartAddedEvent;
        logDebug(
          `content_part.added: type=${contentAddedEvent.part.type}, item_id=${contentAddedEvent.item_id}, content_index=${contentAddedEvent.content_index}`,
          contentAddedEvent,
          { requestId: this.requestId }
        );
        if (contentAddedEvent.item_id) {
          this.responseId = contentAddedEvent.item_id;
          logInfo(`Captured response ID: ${this.responseId}`, undefined, { requestId: this.requestId });
        }
        break;
      }
      case "response.content_part.done": {
        const contentDoneEvent = ev as ResponseContentPartDoneEvent;
        logDebug(
          `content_part.done: type=${contentDoneEvent.part.type}, item_id=${contentDoneEvent.item_id}`,
          contentDoneEvent,
          { requestId: this.requestId }
        );
        break;
      }
      case "response.completed": {
        this.completed = true;
        if (isResponseCompletedEvent(ev)) {
          const resp = ev.response;
          if (resp?.usage?.output_tokens) this.usage.output_tokens = resp.usage.output_tokens;
          if (resp?.usage?.input_tokens) this.usage.input_tokens = resp.usage.input_tokens;
        }
        await this.messageStop();
        await this.done();
        break;
      }
      case "response.web_search_call.in_progress": {
        if (isWebSearchInProgressEvent(ev)) {
          const extendedEv = ev as ResponseWebSearchCallInProgressEvent & { query?: string };
          logDebug("web_search_call.in_progress", { query: extendedEv.query }, { requestId: this.requestId });
        }
        break;
      }
      case "response.web_search_call.searching": {
        if (isWebSearchSearchingEvent(ev)) {
          const extendedEv = ev as ResponseWebSearchCallSearchingEvent & { query?: string };
          logDebug("web_search_call.searching", { query: extendedEv.query }, { requestId: this.requestId });
        }
        break;
      }
      case "response.web_search_call.completed": {
        if (isWebSearchCompletedEvent(ev)) {
          const extendedEv = ev as ResponseWebSearchCallCompletedEvent & { query?: string; result_count?: number };
          logDebug(
            "web_search_call.completed",
            { query: extendedEv.query, result_count: extendedEv.result_count },
            { requestId: this.requestId }
          );
        }
        break;
      }
      default:
        logUnexpected("Unhandled event type", ev.type, { event: ev }, { requestId: this.requestId });
    }
  }

  getResult() {
    return { responseId: this.responseId, usage: this.usage } as const;
  }

  cleanup(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
  }
}
