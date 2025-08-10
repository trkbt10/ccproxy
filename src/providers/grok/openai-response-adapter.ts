// Minimal Grok (x.ai) to OpenAI Responses compatibility adapter
import type { OpenAICompatResponse, OpenAICompatStreamEvent } from "../openai-compat/compat";

// Non-stream: map chat.completions-style response to OpenAI Responses
export function grokToOpenAIResponse(resp: any, model = "grok"): OpenAICompatResponse {
  const text = resp?.choices?.[0]?.message?.content || "";
  return {
    id: resp?.id || `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    usage: {
      input_tokens: resp?.usage?.prompt_tokens || 0,
      output_tokens: resp?.usage?.completion_tokens || 0,
    },
  };
}

// Stream: map chat.completion.chunk stream to Responses events
export async function* grokToOpenAIStream(src: AsyncIterable<any>): AsyncGenerator<OpenAICompatStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  yield { type: "response.created", response: { id, status: "in_progress" } };
  for await (const chunk of src) {
    const delta = chunk?.choices?.[0]?.delta?.content || "";
    if (delta) {
      yield { type: "response.output_text.delta", delta };
    }
    const finish = chunk?.choices?.[0]?.finish_reason;
    if (finish) break;
  }
  yield { type: "response.output_text.done" };
  yield { type: "response.completed", response: { id, status: "completed" } };
}

