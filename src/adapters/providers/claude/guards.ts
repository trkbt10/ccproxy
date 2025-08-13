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
  ImageBlockParam,
  ToolResultBlockParam,
  TextBlock,
  ToolUseBlock,
  Usage,
  MessageDeltaUsage,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionFunctionTool,
} from "openai/resources/chat/completions";
import type {
  ResponseInput,
  EasyInputMessage,
  ResponseOutputMessage,
  Tool,
  ResponseOutputText,
  ResponseOutputItem,
  FunctionTool,
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

export function isChatCompletionFunctionTool(t: ChatCompletionTool): t is ChatCompletionFunctionTool {
  return t.type === 'function';
}

export function isOpenAIFunctionTool(t: Tool): t is FunctionTool {
  return t.type === 'function';
}

// Response output type guards
export function isResponseOutputText(item: ResponseOutputItem): item is ResponseOutputText {
  return item.type === 'output_text';
}

export function isResponseOutputMessage(item: ResponseOutputItem): item is ResponseOutputMessage {
  return item.type === 'message';
}

// Claude block type guards with proper typing
export function isImageBlockParam(block: unknown): block is ImageBlockParam {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as any).type === 'image' &&
    'source' in block
  );
}

export function isToolResultBlockParam(block: unknown): block is ToolResultBlockParam {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as any).type === 'tool_result' &&
    'tool_use_id' in block
  );
}

// Usage type guards
export function hasUsage(obj: unknown): obj is { usage: Usage } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'usage' in obj &&
    typeof (obj as any).usage === 'object' &&
    (obj as any).usage !== null &&
    'input_tokens' in (obj as any).usage &&
    'output_tokens' in (obj as any).usage
  );
}

export function hasDeltaUsage(obj: unknown): obj is { delta: { usage?: MessageDeltaUsage } } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'delta' in obj &&
    typeof (obj as any).delta === 'object' &&
    (obj as any).delta !== null &&
    'usage' in (obj as any).delta
  );
}

// Content array type guard
export function hasContentArray(msg: unknown): msg is { content: ContentBlock[] } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'content' in msg &&
    Array.isArray((msg as any).content)
  );
}

// Tool conversion helpers
export function convertChatCompletionToolToTool(chatTool: ChatCompletionTool): Tool | null {
  if (!isChatCompletionFunctionTool(chatTool)) return null;
  
  return {
    type: 'function',
    name: chatTool.function.name,
    description: chatTool.function.description || undefined,
    parameters: chatTool.function.parameters || {},
    strict: chatTool.function.strict !== false,
  };
}
