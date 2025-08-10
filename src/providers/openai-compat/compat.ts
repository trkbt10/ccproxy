// Minimal OpenAI Responses compatibility types used by our pipeline
export type OpenAICompatResponse = {
  id: string;
  object?: string;
  created_at?: number;
  model?: string;
  status: "in_progress" | "completed" | "incomplete" | string;
  output?: Array<
    | {
        type: "message";
        role?: string;
        content?: Array<{ type: "output_text"; text: string }>;
      }
    | {
        type: "function_call";
        id?: string;
        name: string;
        arguments?: string;
        call_id?: string;
      }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type OpenAICompatStreamEvent =
  | { type: "response.created"; response: { id: string; status: string } }
  | { type: "response.output_text.delta"; delta: string }
  | { type: "response.output_text.done" }
  | { type: "response.completed"; response: { id: string; status: string } };

export function buildTextResponse(text: string, model?: string): OpenAICompatResponse {
  const output: NonNullable<OpenAICompatResponse["output"]> = [
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text,
        },
      ],
    },
  ];

  const res: OpenAICompatResponse = {
    id: `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: model || "gpt-4o-mini",
    status: "completed",
    output,
    usage: {
      input_tokens: 0,
      output_tokens: Math.max(1, Math.ceil(text.length / 4)),
    },
  };

  return res;
}

export async function* streamFromText(text: string, chunkSize = 64): AsyncGenerator<OpenAICompatStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  yield { type: "response.created", response: { id, status: "in_progress" } };

  for (let i = 0; i < text.length; i += chunkSize) {
    const delta = text.slice(i, i + chunkSize);
    yield { type: "response.output_text.delta", delta };
  }

  yield { type: "response.output_text.done" };
  yield {
    type: "response.completed",
    response: { id, status: "completed" },
  };
}
