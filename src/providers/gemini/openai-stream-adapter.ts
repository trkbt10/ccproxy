import type { ResponseStreamEvent as OpenAIResponseStreamEvent } from "openai/resources/responses/responses";
import type { GenerateContentResponse, GeminiPart } from "./fetch-client";

function extractText(resp: GenerateContentResponse): string {
  const cand = resp.candidates && resp.candidates[0];
  const parts = cand?.content?.parts || [];
  let text = "";
  for (const p of parts as GeminiPart[]) {
    if ("text" in p && typeof p.text === "string") text += p.text;
  }
  return text;
}

function extractFunctionCalls(resp: GenerateContentResponse): Array<{ id?: string; name: string; arguments?: string }> {
  const out: Array<{ id?: string; name: string; arguments?: string }> = [];
  const cand = resp.candidates && resp.candidates[0];
  const parts = cand?.content?.parts || [];
  for (const p of parts as GeminiPart[]) {
    if ("functionCall" in p && p.functionCall && typeof p.functionCall.name === "string") {
      const args = p.functionCall.args !== undefined ? JSON.stringify(p.functionCall.args) : undefined;
      out.push({ name: p.functionCall.name, arguments: args });
    }
  }
  return out;
}

export async function* geminiToOpenAIStream(
  src: AsyncIterable<GenerateContentResponse>
): AsyncGenerator<OpenAIResponseStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  yield { type: "response.created", response: { id, status: "in_progress" } } as OpenAIResponseStreamEvent;

  // Accumulate emitted plain text so we can compute robust deltas
  let accumulatedText = "";
  let emittedAnyTextDelta = false;
  let lastTextSeen = "";
  // Track emitted function call signatures to avoid duplicates across chunks
  const seenFnCalls = new Set<string>();

  for await (const chunk of src) {
    const text = extractText(chunk);
    if (text) lastTextSeen = text;
    if (text) {
      let delta = "";
      if (text.startsWith(accumulatedText)) {
        // Cumulative mode: chunk contains full text so far
        delta = text.slice(accumulatedText.length);
        accumulatedText = text;
      } else if (accumulatedText && accumulatedText.startsWith(text)) {
        // Truncation or rewind; ignore this chunk
        delta = "";
      } else {
        // Incremental mode: chunk is the new delta
        delta = text;
        accumulatedText += text;
      }
      if (delta) {
        yield { type: "response.output_text.delta", delta } as OpenAIResponseStreamEvent;
        emittedAnyTextDelta = true;
      }
    }

    const calls = extractFunctionCalls(chunk);
    for (const c of calls) {
      const sig = `${c.name}|${c.arguments ?? ""}`;
      if (seenFnCalls.has(sig)) continue;
      seenFnCalls.add(sig);
      yield {
        type: "response.output_item.added",
        item: { type: "function_call", id: c.id, call_id: c.id, name: c.name, arguments: c.arguments },
      } as OpenAIResponseStreamEvent;
      if (c.arguments) {
        yield { type: "response.function_call_arguments.delta", delta: c.arguments } as OpenAIResponseStreamEvent;
      }
      yield {
        type: "response.output_item.done",
        item: { type: "function_call", id: c.id, call_id: c.id, name: c.name, arguments: c.arguments },
      } as OpenAIResponseStreamEvent;
    }
  }
  // Synthesize at least one text delta event for OpenAI parity if none were emitted
  if (!emittedAnyTextDelta) {
    const fallback = lastTextSeen || "";
    yield { type: "response.output_text.delta", delta: fallback } as OpenAIResponseStreamEvent;
  }
  yield { type: "response.output_text.done" } as OpenAIResponseStreamEvent;
  yield { type: "response.completed", response: { id, status: "completed" } } as OpenAIResponseStreamEvent;
}
