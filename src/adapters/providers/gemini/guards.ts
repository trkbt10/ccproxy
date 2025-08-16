import type { GenerateContentResponse, GeminiContent, GeminiPart } from "./client/fetch-client";

export function isGeminiResponse(v: unknown): v is GenerateContentResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return "candidates" in o || "usageMetadata" in o;
}

export async function* ensureGeminiStream(
  src: AsyncIterable<unknown>
): AsyncGenerator<GenerateContentResponse, void, unknown> {
  for await (const it of src) {
    if (isGeminiResponse(it)) {
      yield it;
    } else {
      throw new TypeError(
        "Stream chunk is not a Gemini GenerateContentResponse shape"
      );
    }
  }
}

// Gemini parts guards
export function isGeminiTextPart(p: unknown): p is Extract<GeminiPart, { text: string }> {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as { text?: unknown }).text !== undefined &&
    typeof (p as { text?: unknown }).text === "string"
  );
}

export function isGeminiFunctionCallPart(
  p: unknown
): p is Extract<GeminiPart, { functionCall: { name: string; args?: unknown } }> {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as { functionCall?: unknown }).functionCall !== undefined &&
    typeof (p as { functionCall?: { name?: unknown } }).functionCall?.name === "string"
  );
}

export function isGeminiFunctionResponsePart(
  p: unknown
): p is Extract<GeminiPart, { functionResponse: { name: string; response?: unknown } }> {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as { functionResponse?: unknown }).functionResponse !== undefined &&
    typeof (p as { functionResponse?: { name?: unknown } }).functionResponse?.name === "string"
  );
}

// Helpers to read candidate parts safely
export function getFirstCandidate(resp: GenerateContentResponse): { content?: GeminiContent; finishReason?: string } | undefined {
  const arr = (resp as { candidates?: Array<{ content?: GeminiContent; finishReason?: string }> }).candidates;
  return Array.isArray(arr) ? arr[0] : undefined;
}

export function getCandidateParts(resp: GenerateContentResponse): GeminiPart[] {
  const cand = getFirstCandidate(resp);
  const content = cand?.content;
  const parts = (content as { parts?: unknown })?.parts;
  return Array.isArray(parts) ? (parts as GeminiPart[]) : [];
}
