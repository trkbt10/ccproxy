import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

// Groq speaks OpenAI Responses natively; these adapters are identity.
export function groqToOpenAIResponse(resp: OpenAIResponse): OpenAIResponse {
  return resp;
}

export async function* groqToOpenAIStream(
  src: AsyncIterable<ResponseStreamEvent>
): AsyncGenerator<ResponseStreamEvent, void, unknown> {
  for await (const ev of src) yield ev;
}

