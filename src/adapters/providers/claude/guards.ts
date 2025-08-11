import type {
  Message as ClaudeMessage,
  MessageStreamEvent,
  ContentBlock,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
  Tool as ClaudeTool,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
} from "openai/resources/chat/completions";
import type {
  ResponseInput,
  EasyInputMessage,
  ResponseOutputMessage,
  Tool,
} from "openai/resources/responses/responses";

// Claude content block guards
export function isTextBlock(block: ContentBlock | unknown): block is Extract<ContentBlock, { type: 'text' }> {
  return typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string';
}

export function isToolUseBlock(block: ContentBlock | unknown): block is Extract<ContentBlock, { type: 'tool_use' }> {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: unknown }).type === 'tool_use' &&
    typeof (block as { id?: unknown }).id === 'string' &&
    typeof (block as { name?: unknown }).name === 'string'
  );
}

// Stream event guards
export function isContentStart(ev: MessageStreamEvent): ev is ContentBlockStartEvent {
  return (ev as { type?: string }).type === 'content_block_start';
}

export function isContentDelta(ev: MessageStreamEvent): ev is ContentBlockDeltaEvent {
  return (ev as { type?: string }).type === 'content_block_delta';
}

export function isContentStop(ev: MessageStreamEvent): ev is ContentBlockStopEvent {
  return (ev as { type?: string }).type === 'content_block_stop';
}

export function isMessageDeltaWithStop(ev: MessageStreamEvent): ev is MessageDeltaEvent {
  return (ev as { type?: string }).type === 'message_delta' && typeof (ev as { delta?: { stop_reason?: unknown } }).delta?.stop_reason !== 'undefined';
}

export function isMessageStop(ev: MessageStreamEvent): ev is MessageStopEvent {
  return (ev as { type?: string }).type === 'message_stop';
}

// Content delta subtypes
export function isTextDelta(ev: ContentBlockDeltaEvent["delta"]): ev is { type: 'text_delta'; text: string } {
  return (ev as { type?: unknown }).type === 'text_delta' && typeof (ev as { text?: unknown }).text === 'string';
}

export function isInputJsonDelta(ev: ContentBlockDeltaEvent["delta"]): ev is { type: 'input_json_delta'; partial_json: string } {
  return (ev as { type?: unknown }).type === 'input_json_delta' && typeof (ev as { partial_json?: unknown }).partial_json === 'string';
}

// OpenAI Responses input guards (minimal)
export function isEasyInputMessage(v: unknown): v is EasyInputMessage {
  return (
    typeof v === 'object' && v !== null &&
    'role' in (v as Record<string, unknown>) &&
    'content' in (v as Record<string, unknown>)
  );
}

export function isResponseOutputMessageItem(v: unknown): v is ResponseOutputMessage {
  return (
    typeof v === 'object' && v !== null &&
    (v as { type?: unknown }).type === 'message' &&
    Array.isArray((v as { content?: unknown }).content)
  );
}

// Chat content helpers
export function isTextPart(part: ChatCompletionContentPart): part is ChatCompletionContentPartText {
  return (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string';
}

export function contentToPlainText(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    let text = '';
    for (const part of content as ChatCompletionContentPart[]) {
      if (isTextPart(part)) text += part.text;
    }
    return text;
  }
  return '';
}

// Tool helpers
export function isFunctionTool(t: Tool | ChatCompletionTool): t is ChatCompletionTool & { type: 'function' } {
  return typeof t === 'object' && t !== null && (t as { type?: unknown }).type === 'function' && typeof (t as { function?: { name?: unknown } }).function?.name === 'string';
}
