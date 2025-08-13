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
  ChatCompletionContentPartRefusal,
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
export function isTextBlock(block: ContentBlock | unknown): block is TextBlock {
  if (typeof block !== 'object' || block === null) return false;
  const obj = block as { type?: unknown; text?: unknown };
  return obj.type === 'text' && typeof obj.text === 'string';
}

export function isToolUseBlock(block: ContentBlock | unknown): block is ToolUseBlock {
  if (typeof block !== 'object' || block === null) return false;
  const obj = block as { type?: unknown; id?: unknown; name?: unknown };
  return (
    obj.type === 'tool_use' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string'
  );
}

// Stream event guards
export function isContentStart(ev: MessageStreamEvent): ev is ContentBlockStartEvent {
  return 'type' in ev && ev.type === 'content_block_start';
}

export function isContentDelta(ev: MessageStreamEvent): ev is ContentBlockDeltaEvent {
  return 'type' in ev && ev.type === 'content_block_delta';
}

export function isContentStop(ev: MessageStreamEvent): ev is ContentBlockStopEvent {
  return 'type' in ev && ev.type === 'content_block_stop';
}

export function isMessageDeltaWithStop(ev: MessageStreamEvent): ev is MessageDeltaEvent {
  if (!('type' in ev) || ev.type !== 'message_delta') return false;
  const deltaEvent = ev as { delta?: { stop_reason?: unknown } };
  return typeof deltaEvent.delta?.stop_reason !== 'undefined';
}

export function isMessageStop(ev: MessageStreamEvent): ev is MessageStopEvent {
  return 'type' in ev && ev.type === 'message_stop';
}

// Content delta subtypes
export function isTextDelta(ev: ContentBlockDeltaEvent["delta"]): ev is { type: 'text_delta'; text: string } {
  if (typeof ev !== 'object' || ev === null) return false;
  const obj = ev as { type?: unknown; text?: unknown };
  return obj.type === 'text_delta' && typeof obj.text === 'string';
}

export function isInputJsonDelta(ev: ContentBlockDeltaEvent["delta"]): ev is { type: 'input_json_delta'; partial_json: string } {
  if (typeof ev !== 'object' || ev === null) return false;
  const obj = ev as { type?: unknown; partial_json?: unknown };
  return obj.type === 'input_json_delta' && typeof obj.partial_json === 'string';
}

// OpenAI Responses input guards (minimal)
export function isEasyInputMessage(v: unknown): v is EasyInputMessage {
  return (
    typeof v === 'object' && v !== null &&
    'role' in v &&
    'content' in v
  );
}

export function isResponseOutputMessageItem(v: unknown): v is ResponseOutputMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { type?: unknown; content?: unknown };
  return obj.type === 'message' && Array.isArray(obj.content);
}

// Chat content helpers
export function isTextPart(part: ChatCompletionContentPart | ChatCompletionContentPartRefusal): part is ChatCompletionContentPartText {
  if (typeof part !== 'object' || part === null) return false;
  const obj = part as { type?: unknown; text?: unknown };
  return obj.type === 'text' && typeof obj.text === 'string';
}

export function isRefusalPart(part: ChatCompletionContentPart | ChatCompletionContentPartRefusal): part is ChatCompletionContentPartRefusal {
  if (typeof part !== 'object' || part === null) return false;
  const obj = part as { type?: unknown; refusal?: unknown };
  return obj.type === 'refusal' && typeof obj.refusal === 'string';
}

export function contentToPlainText(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    let text = '';
    for (const part of content) {
      if (isTextPart(part)) {
        text += part.text;
      } else if (isRefusalPart(part)) {
        text += part.refusal || '';
      }
    }
    return text;
  }
  return '';
}

// Tool helpers
export function isFunctionTool(t: Tool | ChatCompletionTool): t is ChatCompletionTool & { type: 'function' } {
  if (typeof t !== 'object' || t === null) return false;
  const obj = t as { type?: unknown; function?: { name?: unknown } };
  return obj.type === 'function' && typeof obj.function?.name === 'string';
}

export function isChatCompletionFunctionTool(t: ChatCompletionTool): t is ChatCompletionFunctionTool {
  return t.type === 'function';
}

export function isOpenAIFunctionTool(t: Tool): t is FunctionTool {
  return t.type === 'function';
}

// Response output type guards
export function isResponseOutputText(item: unknown): item is ResponseOutputText {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as { type?: unknown };
  return obj.type === 'output_text';
}

export function isResponseOutputMessage(item: unknown): item is ResponseOutputMessage {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as { type?: unknown };
  return obj.type === 'message';
}

// Claude block type guards with proper typing
export function isImageBlockParam(block: unknown): block is ImageBlockParam {
  if (typeof block !== 'object' || block === null) return false;
  const obj = block as { type?: unknown; source?: unknown };
  return obj.type === 'image' && 'source' in obj;
}

export function isToolResultBlockParam(block: unknown): block is ToolResultBlockParam {
  if (typeof block !== 'object' || block === null) return false;
  const obj = block as { type?: unknown; tool_use_id?: unknown };
  return obj.type === 'tool_result' && 'tool_use_id' in obj;
}

// Usage type guards
export function hasUsage(obj: unknown): obj is { usage: Usage } {
  if (typeof obj !== 'object' || obj === null) return false;
  const withUsage = obj as { usage?: unknown };
  if (typeof withUsage.usage !== 'object' || withUsage.usage === null) return false;
  const usage = withUsage.usage as { input_tokens?: unknown; output_tokens?: unknown };
  return 'input_tokens' in usage && 'output_tokens' in usage;
}

export function hasDeltaUsage(obj: unknown): obj is { delta: { usage?: MessageDeltaUsage } } {
  if (typeof obj !== 'object' || obj === null) return false;
  const withDelta = obj as { delta?: unknown };
  if (typeof withDelta.delta !== 'object' || withDelta.delta === null) return false;
  return 'usage' in withDelta.delta;
}

// Content array type guard
export function hasContentArray(msg: unknown): msg is { content: ContentBlock[] } {
  if (typeof msg !== 'object' || msg === null) return false;
  const withContent = msg as { content?: unknown };
  return Array.isArray(withContent.content);
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
