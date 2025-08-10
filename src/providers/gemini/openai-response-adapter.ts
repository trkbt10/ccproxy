import type { GenerateContentResponse } from "./fetch-client";
import type { OpenAICompatResponse } from "../openai-compat/compat";

function extractText(resp: GenerateContentResponse): string {
  const cand = resp.candidates && resp.candidates[0];
  const parts = cand?.content?.parts || [];
  let text = "";
  for (const p of parts as Array<{ text?: string }>) {
    if (typeof p?.text === "string") text += p.text;
  }
  return text;
}

export function geminiToOpenAIResponse(resp: GenerateContentResponse, model = "gemini"): OpenAICompatResponse {
  const text = extractText(resp);
  const out: OpenAICompatResponse = {
    id: `resp_${Date.now()}`,
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
      input_tokens: resp.usageMetadata?.promptTokenCount || 0,
      output_tokens: resp.usageMetadata?.candidatesTokenCount || 0,
    },
  };
  return out;
}

