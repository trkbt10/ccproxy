import type { ImageBlockParam, URLImageSource, Base64ImageSource, ToolResultBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { convertClaudeImageToOpenAI, convertToolResult, convertClaudeMessage } from "./message-converters";
import { UnifiedIdManager as CallIdManager } from "../../../utils/id-management/unified-id-manager";

describe("Claude provider local converters", () => {
  test("convertClaudeImageToOpenAI base64", () => {
    const img: ImageBlockParam = {
      type: 'image',
      source: { type: 'base64', data: 'aGVsbG8gd29ybGQ=', media_type: 'image/jpeg' } as Base64ImageSource,
    };
    const res = convertClaudeImageToOpenAI(img);
    expect(res).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,aGVsbG8gd29ybGQ=', detail: 'auto' });
  });

  test("convertClaudeImageToOpenAI url", () => {
    const img: ImageBlockParam = {
      type: 'image',
      source: { type: 'url', url: 'https://example.com/img.jpg' } as URLImageSource,
    };
    const res = convertClaudeImageToOpenAI(img);
    expect(res).toEqual({ type: 'input_image', image_url: 'https://example.com/img.jpg', detail: 'auto' });
  });

  test("convertToolResult mapping and fallback", () => {
    const toolRes: ToolResultBlockParam = { type: 'tool_result', tool_use_id: 'tool_1', content: 'ok' };
    const m = new CallIdManager();
    // fallback when no mapping
    expect(convertToolResult(toolRes, m)).toEqual({ id: 'tool_1', type: 'function_call_output', call_id: 'tool_1', output: 'ok' });
    // with mapping
    m.registerMapping('call_1', 'tool_1', 't', { source: 'test' });
    expect(convertToolResult(toolRes, m)).toEqual({ id: 'tool_1', type: 'function_call_output', call_id: 'call_1', output: 'ok' });
  });

  test("convertClaudeMessage assistant text + tool_use", () => {
    const msg: MessageParam = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Hello.' },
        { type: 'tool_use', id: 'tool_a', name: 'calc', input: { a: 1 } },
      ],
    };
    const m = new CallIdManager();
    m.registerMapping('call_a', 'tool_a', 'calc', { source: 'test' });
    const res = convertClaudeMessage(msg, m);
    expect(res).toEqual([
      { type: 'message', role: 'assistant', content: 'Hello.' },
      { type: 'function_call', call_id: 'call_a', name: 'calc', arguments: JSON.stringify({ a: 1 }) },
    ]);
  });

  test("convertClaudeMessage user text/image/tool_result", () => {
    const msg: MessageParam = {
      role: 'user',
      content: [
        { type: 'text', text: 'A' },
        { type: 'text', text: 'B' },
        { type: 'image', source: { type: 'url', url: 'https://example.com/i.png' } as URLImageSource },
        { type: 'tool_result', tool_use_id: 'tool_x', content: 'R' },
      ],
    };
    const m = new CallIdManager();
    m.registerMapping('call_x', 'tool_x', 't', { source: 'test' });
    const res = convertClaudeMessage(msg, m);
    expect(res).toEqual([
      { type: 'message', role: 'user', content: [ { type: 'input_text', text: 'A' }, { type: 'input_text', text: 'B' } ] },
      { type: 'message', role: 'user', content: [ { type: 'input_image', image_url: 'https://example.com/i.png', detail: 'auto' } ] },
      { id: 'tool_x', type: 'function_call_output', call_id: 'call_x', output: 'R' },
    ]);
  });
});

