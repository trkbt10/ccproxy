export type GrokFunction = { name: string; arguments?: string };
export type GrokToolCall = { id?: string; type: "function"; function: GrokFunction };
export type GrokMessage = { role: string; content?: string; tool_calls?: GrokToolCall[] };
export type GrokChoice = {
  message?: GrokMessage;
  delta?: { content?: string; tool_calls?: GrokToolCall[] };
  finish_reason?: string;
};
export type GrokChatCompletion = {
  id?: string;
  choices?: GrokChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function isGrokChatCompletion(v: unknown): v is GrokChatCompletion {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const choices = o["choices"];
  if (!Array.isArray(choices)) return false;
  const c0 = choices[0] as unknown;
  if (typeof c0 !== "object" || c0 === null) return false;
  return true;
}

export async function* ensureGrokStream(
  src: AsyncIterable<unknown>
): AsyncGenerator<GrokChatCompletion, void, unknown> {
  for await (const it of src) {
    if (isGrokChatCompletion(it)) {
      yield it;
    } else {
      throw new TypeError(
        "Stream chunk is not a GrokChatCompletion shape"
      );
    }
  }
}

