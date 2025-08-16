import { GenerateContentResponse } from "./fetch-client";

export async function* streamText(reader: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const dec = new TextDecoder();
  const r = reader.getReader();
  while (true) {
    const { value, done } = await r.read();
    if (done) break;
    if (value) yield dec.decode(value, { stream: true });
  }
}
export async function* yieldSSEParts(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  const state = { buf: "" };

  for await (const textChunk of chunks) {
    state.buf += textChunk;

    const events = state.buf.split(/\r?\n\r?\n/);
    state.buf = events.pop() ?? "";

    for (const evt of events) {
      const dataLines = evt.split(/\r?\n/).filter((l) => l.startsWith("data:"));
      if (dataLines.length === 0) continue;
      const payload = dataLines.map((l) => l.slice(5).trimStart()).join("\n");
      if (payload === "[DONE]") continue;
      return yield payload;
    }

    if (state.buf.trim()) {
      return yield state.buf;
    }
  }
}
export async function* yieldInnerJsonBlocks(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let seenArrayStart = false;

  let depth = 0;

  let buf = "";

  let inString = false;

  let escape = false;

  for await (const chunkText of chunks) {
    const s = chunkText;

    for (let i = 0; i < s.length; i++) {
      const c = s[i];

      if (!seenArrayStart) {
        if (c === "[") seenArrayStart = true;
        continue;
      }

      if (depth === 0) {
        if (c === "{") {
          depth = 1;
          buf = "{";
          inString = false;
          escape = false;
        }

        continue;
      }

      buf += c;

      if (escape) {
        escape = false;

        continue;
      }
      if (c === "\\") {
        if (inString) escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (c === "{") {
          depth++;
        } else if (c === "}") {
          depth--;
          if (depth === 0) {
            yield buf;
            buf = "";
          }
        }
      }
    }
  }
}
