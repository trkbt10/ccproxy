import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isResponseEventStream(
  v: unknown
): v is AsyncIterable<ResponseStreamEvent> {
  return isObject(v) && Symbol.asyncIterator in v;
}

export function isResponseStreamEvent(v: unknown): v is ResponseStreamEvent {
  return isObject(v) && typeof (v as { type?: unknown }).type === "string";
}

export async function* ensureOpenAIResponseStream(
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

export function isOpenAIResponse(v: unknown): v is OpenAIResponse {
  return isObject(v) && (v as { object?: unknown }).object === "response";
}

export function responseHasFunctionCall(resp: OpenAIResponse): boolean {
  const out = (resp as { output?: unknown }).output;
  if (!Array.isArray(out)) return false;
  return out.some(
    (i) => isObject(i) && (i as { type?: unknown }).type === "function_call"
  );
}
