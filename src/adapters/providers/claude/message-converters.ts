import type {
  MessageParam as ClaudeMessageParam,
  ImageBlockParam,
  Base64ImageSource,
  URLImageSource,
  ToolResultBlockParam,
  ContentBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseInputItem,
  EasyInputMessage,
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem,
} from "openai/resources/responses/responses";
import { UnifiedIdManager } from "../../../utils/id-management/unified-id-manager";

function isBase64Source(src: unknown): src is Base64ImageSource {
  return (
    typeof src === 'object' && src !== null &&
    (src as { type?: unknown }).type === 'base64' &&
    typeof (src as { data?: unknown }).data === 'string' &&
    typeof (src as { media_type?: unknown }).media_type === 'string'
  );
}

function isURLSource(src: unknown): src is URLImageSource {
  return (
    typeof src === 'object' && src !== null &&
    (src as { type?: unknown }).type === 'url' &&
    typeof (src as { url?: unknown }).url === 'string'
  );
}

export function convertClaudeImageToOpenAI(img: ImageBlockParam): { type: 'input_image'; image_url: string; detail: 'auto' } {
  const src = img.source;
  if (isBase64Source(src)) {
    return { type: 'input_image', image_url: `data:${src.media_type};base64,${src.data}`, detail: 'auto' };
  }
  if (isURLSource(src)) {
    return { type: 'input_image', image_url: src.url, detail: 'auto' };
  }
  throw new Error('Unsupported image source');
}

export function convertToolResult(
  block: ToolResultBlockParam,
  idManager: UnifiedIdManager
): ResponseFunctionToolCallOutputItem {
  const callId = idManager.getOpenAICallId(block.tool_use_id) || block.tool_use_id;
  const output = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
  return { id: block.tool_use_id, type: 'function_call_output', call_id: callId, output };
}

export function convertClaudeMessage(
  message: ClaudeMessageParam,
  idManager: UnifiedIdManager
): ResponseInputItem[] {
  const out: ResponseInputItem[] = [];
  const role = message.role;
  const content = message.content;
  if (typeof content === 'string') {
    out.push({ role, content });
    return out;
  }

  // content is array of blocks
  const blocks = content as ContentBlockParam[];

  if (role === 'assistant') {
    let textBuffer = '';
    const flushText = () => {
      if (textBuffer.length > 0) {
        out.push({ role: 'assistant', content: textBuffer });
        textBuffer = '';
      }
    };
    for (const b of blocks) {
      if ((b as { type: string }).type === 'text' && typeof (b as { text?: unknown }).text === 'string') {
        textBuffer += (b as { text: string }).text;
      } else if ((b as { type: string }).type === 'tool_use') {
        flushText();
        const id = (b as { id: string }).id;
        const name = (b as { name: string }).name;
        const args = JSON.stringify((b as { input?: unknown }).input ?? {});
        const existing = idManager.getOpenAICallId(id);
        const callId = existing || id;
        out.push({ type: 'function_call', call_id: callId, name, arguments: args });
      }
    }
    flushText();
    return out;
  }

  if (role === 'user') {
    // user can carry tool_result / images / text blocks
    let textParts: Array<{ type: 'input_text'; text: string }> = [];
    const flushTextParts = () => {
      if (textParts.length > 0) {
        out.push({ role: 'user', content: textParts });
        textParts = [];
      }
    };
    for (const b of blocks) {
      const t = (b as { type: string }).type;
      if (t === 'text' && typeof (b as { text?: unknown }).text === 'string') {
        textParts.push({ type: 'input_text', text: (b as { text: string }).text });
      } else if (t === 'image') {
        flushTextParts();
        const img = convertClaudeImageToOpenAI(b as ImageBlockParam);
        out.push({ role: 'user', content: [img] });
      } else if (t === 'tool_result') {
        flushTextParts();
        out.push(convertToolResult(b as ToolResultBlockParam, idManager));
      }
    }
    // final flush: if single part remaining, emit as plain string to match expected shape
    if (textParts.length === 1) {
      const only = textParts[0];
      out.push({ role: 'user', content: only.text });
      textParts = [];
    } else {
      flushTextParts();
    }
    return out;
  }

  // default passthrough for developer/system
  out.push({ role, content: '' });
  return out;
}
