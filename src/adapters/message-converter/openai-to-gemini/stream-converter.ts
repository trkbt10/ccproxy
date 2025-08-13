import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import type { GeminiGenerateContentResponse, GeminiCandidate, GeminiContent, GeminiPart } from "./types";

export async function* openAIStreamToGemini(
  stream: AsyncIterable<ChatCompletionChunk>,
  modelName: string,
  isSSE: boolean
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  let accumulatedContent = "";
  let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    if (!chunk.choices || chunk.choices.length === 0) continue;

    const choice = chunk.choices[0];
    const delta = choice.delta;

    // Accumulate content
    if (delta.content) {
      accumulatedContent += delta.content;
    }

    // Handle tool calls
    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index || 0;
        
        if (!currentToolCalls.has(index)) {
          currentToolCalls.set(index, {
            id: toolCall.id || "",
            name: toolCall.function?.name || "",
            arguments: ""
          });
        }

        const current = currentToolCalls.get(index)!;
        if (toolCall.function?.name) {
          current.name = toolCall.function.name;
        }
        if (toolCall.function?.arguments) {
          current.arguments += toolCall.function.arguments;
        }
      }
    }

    // Track usage
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens || promptTokens;
      completionTokens = chunk.usage.completion_tokens || completionTokens;
    }

    // Build Gemini response chunk
    const parts: GeminiPart[] = [];
    
    if (delta.content) {
      parts.push({ text: delta.content });
    }

    // Only send if we have content
    if (parts.length > 0 || choice.finish_reason) {
      const content: GeminiContent = {
        role: "model",
        parts
      };

      const candidate: GeminiCandidate = {
        content,
        finishReason: choice.finish_reason ? mapOpenAIFinishReasonToGemini(choice.finish_reason) : undefined,
        index: 0,
        safetyRatings: []
      };

      const response: GeminiGenerateContentResponse = {
        candidates: [candidate]
      };

      // Add usage metadata on final chunk
      if (choice.finish_reason) {
        response.usageMetadata = {
          promptTokenCount: promptTokens,
          candidatesTokenCount: completionTokens,
          totalTokenCount: promptTokens + completionTokens
        };

        // Add function calls to final response
        if (currentToolCalls.size > 0) {
          const functionParts: GeminiPart[] = [];
          for (const [_, toolCall] of currentToolCalls) {
            functionParts.push({
              function_call: {
                name: toolCall.name,
                args: JSON.parse(toolCall.arguments)
              }
            });
          }
          if (response.candidates && response.candidates[0]) {
            response.candidates[0].content.parts = functionParts;
          }
        }
      }

      // Format for SSE or raw JSON
      if (isSSE) {
        const data = `data: ${JSON.stringify(response)}\n\n`;
        yield encoder.encode(data);
      } else {
        yield encoder.encode(JSON.stringify(response) + "\n");
      }
    }
  }

  // Send final SSE done message if needed
  if (isSSE) {
    yield encoder.encode("data: [DONE]\n\n");
  }
}

function mapOpenAIFinishReasonToGemini(reason: string): string {
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