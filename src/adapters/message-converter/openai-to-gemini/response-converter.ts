import type { ChatCompletion } from "openai/resources/chat/completions";
import type { GeminiGenerateContentResponse, GeminiCandidate, GeminiContent, GeminiPart } from "./types";

export function openAIToGemini(
  openAIResponse: ChatCompletion,
  modelName: string
): GeminiGenerateContentResponse {
  const candidates: GeminiCandidate[] = [];

  for (let i = 0; i < openAIResponse.choices.length; i++) {
    const choice = openAIResponse.choices[i];
    const message = choice.message;

    const parts: GeminiPart[] = [];

    // Convert message content to parts
    if (message.content) {
      parts.push({ text: message.content });
    }

    // Convert tool calls to function calls
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          parts.push({
            function_call: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments)
            }
          });
        }
      }
    }

    const content: GeminiContent = {
      role: "model",
      parts
    };

    const candidate: GeminiCandidate = {
      content,
      finishReason: mapOpenAIFinishReasonToGemini(choice.finish_reason),
      index: i,
      safetyRatings: []
    };

    candidates.push(candidate);
  }

  // Build response
  const response: GeminiGenerateContentResponse = {
    candidates
  };

  // Add usage metadata if available
  if (openAIResponse.usage) {
    response.usageMetadata = {
      promptTokenCount: openAIResponse.usage.prompt_tokens,
      candidatesTokenCount: openAIResponse.usage.completion_tokens,
      totalTokenCount: openAIResponse.usage.total_tokens
    };
  }

  return response;
}

function mapOpenAIFinishReasonToGemini(reason: string | null): string {
  switch (reason) {
    case "stop":
      return "STOP";
    case "length":
      return "MAX_TOKENS";
    case "tool_calls":
    case "function_call":
      return "STOP";
    case "content_filter":
      return "SAFETY";
    default:
      return "OTHER";
  }
}