import { OpenAICompatResponse } from "../openai-responses/compat";
import { GenerateContentResponse } from "./fetch-client";
import { getCandidateParts, isGeminiFunctionCallPart, isGeminiTextPart } from "./guards";
import { generateOpenAICallId } from "../../../utils/conversation/id-conversion";

function extractText(resp: GenerateContentResponse): string {
  let text = "";
  for (const p of getCandidateParts(resp)) {
    if (isGeminiTextPart(p)) text += p.text;
  }
  return text;
}

function extractFunctionCalls(
  resp: GenerateContentResponse
): Array<{ id: string; name: string; arguments?: string }> {
  const out: Array<{ id: string; name: string; arguments?: string }> = [];
  for (const p of getCandidateParts(resp)) {
    if (isGeminiFunctionCallPart(p)) {
      const args =
        p.functionCall.args !== undefined
          ? JSON.stringify(p.functionCall.args)
          : undefined;
      const callId = generateOpenAICallId();
      out.push({ id: callId, name: p.functionCall.name, arguments: args });
    }
  }
  return out;
}

export function geminiToOpenAIResponse(
  resp: GenerateContentResponse,
  model = "gemini"
): OpenAICompatResponse {
  const text = extractText(resp);
  const calls = extractFunctionCalls(resp);
  const out: OpenAICompatResponse = {
    id: `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: "completed",
    output: [] as NonNullable<OpenAICompatResponse["output"]>,
    usage: {
      input_tokens: resp.usageMetadata?.promptTokenCount || 0,
      output_tokens: resp.usageMetadata?.candidatesTokenCount || 0,
    },
  };
  if (text) {
    (out.output as NonNullable<OpenAICompatResponse["output"]>).push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    });
  }
  for (const c of calls) {
    (out.output as NonNullable<OpenAICompatResponse["output"]>).push({
      type: "function_call",
      id: c.id,
      name: c.name,
      arguments: c.arguments,
      call_id: c.id,
    });
  }
  return out;
}
