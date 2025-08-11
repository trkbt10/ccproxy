import type { SSEStreamingApi } from "hono/streaming";
import type { ClaudeSSESink } from "../../../adapters/message-converter/openai-to-claude/streaming-sse";

export class HonoSSESink implements ClaudeSSESink {
  constructor(private stream: SSEStreamingApi) {}
  async write(event: string, payload: unknown): Promise<void> {
    await this.stream.writeSSE({ event, data: JSON.stringify(payload) });
  }
}

