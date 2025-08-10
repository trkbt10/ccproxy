import type { ResponseStreamEvent as OpenAIResponseStreamEvent } from "openai/resources/responses/responses";
import type { GenerateContentResponse } from "./fetch-client";

function extractText(resp: GenerateContentResponse): string {
  const cand = resp.candidates && resp.candidates[0];
  const parts = cand?.content?.parts || [];
  let text = "";
  for (const p of parts as Array<{ text?: string }>) {
    if (typeof p?.text === "string") text += p.text;
  }
  return text;
}

export async function* geminiToOpenAIStream(
  src: AsyncIterable<GenerateContentResponse>
): AsyncGenerator<OpenAIResponseStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  yield { type: "response.created", response: { id, status: "in_progress" } } as OpenAIResponseStreamEvent;
  let emitted = "";
  for await (const chunk of src) {
    const text = extractText(chunk);
    if (text.length > emitted.length) {
      const delta = text.slice(emitted.length);
      emitted = text;
      if (delta) {
        yield { type: "response.output_text.delta", delta } as OpenAIResponseStreamEvent;
      }
    }
  }
  yield { type: "response.output_text.done" } as OpenAIResponseStreamEvent;
  yield { type: "response.completed", response: { id, status: "completed" } } as OpenAIResponseStreamEvent;
}

