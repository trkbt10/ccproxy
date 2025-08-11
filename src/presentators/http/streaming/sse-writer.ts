import type { SSEStreamingApi } from "hono/streaming";

export class SSEWriter {
  closed = false;
  constructor(private stream: SSEStreamingApi) {}

  async sendEvent(event: string, payload: unknown): Promise<void> {
    await this.stream.writeSSE({ event, data: JSON.stringify(payload) });
  }

  async event(event: string, data: string): Promise<void> {
    await this.stream.writeSSE({ event, data });
  }

  async error(type: string, message: string): Promise<void> {
    await this.sendEvent("error", { type, message });
  }

  async done(): Promise<void> {
    await this.event("done", "{}");
    this.closed = true;
  }

  async ping(): Promise<void> {
    await this.event("ping", "{}");
  }
}
