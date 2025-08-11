import type { SSEStreamingApi } from "hono/streaming";
import type {
  RawMessageStreamEvent,
  RawMessageStartEvent,
  RawMessageDeltaEvent,
  RawMessageStopEvent,
  RawContentBlockStartEvent,
  RawContentBlockDeltaEvent,
  RawContentBlockStopEvent,
} from "@anthropic-ai/sdk/resources/messages";
import { SSEWriter } from "./sse-writer";

/**
 * Claude-specific SSE Writer for sending Claude API events
 */
export class ClaudeSSEWriter extends SSEWriter {
  constructor(stream: SSEStreamingApi) {
    super(stream);
  }

  private async writeClaudeEvent(event: RawMessageStreamEvent) {
    await this.sendEvent(event.type, event);
  }

  async messageStart(id: string) {
    const event: RawMessageStartEvent = {
      type: "message_start",
      message: {
        type: "message",
        id,
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
    };
    await this.writeClaudeEvent(event);
  }

  async textStart(index: number) {
    const event: RawContentBlockStartEvent = {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "", citations: [] },
    };
    await this.writeClaudeEvent(event);
  }

  async deltaText(index: number, delta: string) {
    const event: RawContentBlockDeltaEvent = {
      type: "content_block_delta",
      index,
      delta: { type: "text_delta", text: delta },
    };
    await this.writeClaudeEvent(event);
  }

  async textStop(index: number) {
    const event: RawContentBlockStopEvent = {
      type: "content_block_stop",
      index,
    };
    await this.writeClaudeEvent(event);
  }

  async toolStart(
    index: number,
    item: { id: string; name: string; input?: unknown }
  ) {
    const event: RawContentBlockStartEvent = {
      type: "content_block_start",
      index,
      content_block: {
        type: "tool_use",
        id: item.id,
        name: item.name,
        input: item.input ?? {},
      },
    };
    await this.writeClaudeEvent(event);
  }

  async toolArgsDelta(index: number, partialJson: string) {
    const event: RawContentBlockDeltaEvent = {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partialJson },
    };
    await this.writeClaudeEvent(event);
  }

  async toolStop(index: number) {
    const event: RawContentBlockStopEvent = {
      type: "content_block_stop",
      index,
    };
    await this.writeClaudeEvent(event);
  }

  // Web search tool result helpers
  async webSearchResultStart(index: number, toolUseId?: string) {
    const event: RawContentBlockStartEvent = {
      type: "content_block_start",
      index,
      content_block: {
        // This is a Claude-specific block used by the UI to render search results
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - not in upstream SDK types
        type: "web_search_tool_result",
        // @ts-ignore
        tool_use_id: toolUseId ?? "",
        // @ts-ignore
        content: [],
      },
    };
    await this.writeClaudeEvent(event);
  }

  async webSearchResultDelta(index: number, partialJson: string) {
    const event: RawContentBlockDeltaEvent = {
      type: "content_block_delta",
      index,
      // Use input_json_delta to stream structured status updates
      delta: { type: "input_json_delta", partial_json: partialJson },
    };
    await this.writeClaudeEvent(event);
  }

  async webSearchResultStop(index: number) {
    const event: RawContentBlockStopEvent = {
      type: "content_block_stop",
      index,
    };
    await this.writeClaudeEvent(event);
  }

  async messageDelta(
    delta: RawMessageDeltaEvent["delta"],
    usage: RawMessageDeltaEvent["usage"]
  ) {
    const event: RawMessageDeltaEvent = {
      type: "message_delta",
      delta,
      usage,
    };
    await this.writeClaudeEvent(event);
  }

  async messageStop(_usage?: { input_tokens?: number; output_tokens?: number }) {
    const event: RawMessageStopEvent = { type: "message_stop" };
    await this.writeClaudeEvent(event);
  }
}
