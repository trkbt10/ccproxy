import type { GenerateContentResponse } from "./fetch-client";

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

