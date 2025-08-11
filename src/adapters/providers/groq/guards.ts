import type { ResponseStreamEvent } from "openai/resources/responses/responses";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isResponseEventStream(v: unknown): v is AsyncIterable<ResponseStreamEvent> {
  return isObject(v) && Symbol.asyncIterator in v;
}

export function isResponseStreamEvent(v: unknown): v is ResponseStreamEvent {
  return isObject(v) && typeof (v as { type?: unknown }).type === "string";
}

export async function* ensureGroqResponseStream(
  src: AsyncIterable<unknown>
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  for await (const it of src) {
    if (isResponseStreamEvent(it)) {
      yield it;
    } else {
      throw new TypeError("Stream chunk is not a valid ResponseStreamEvent");
    }
  }
}

