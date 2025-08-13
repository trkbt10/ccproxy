import type { ChatCompletionCreateParams, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { GeminiGenerateContentRequest, GeminiContent, GeminiPart } from "./types";

export function geminiToOpenAI(
  geminiReq: GeminiGenerateContentRequest,
  model: string
): ChatCompletionCreateParams {
  const messages: ChatCompletionCreateParams["messages"] = [];

  // Convert system instruction if present
  if (geminiReq.systemInstruction) {
    const systemContent = extractTextFromParts(geminiReq.systemInstruction.parts);
    if (systemContent) {
      messages.push({
        role: "system",
        content: systemContent
      });
    }
  }

  // Convert contents to messages
  for (const content of geminiReq.contents) {
    const role = mapGeminiRoleToOpenAI(content.role);
    
    // Handle multi-part content
    if (content.parts.length === 1 && content.parts[0].text) {
      // Simple text message
      if (role === "tool") {
        messages.push({
          role,
          content: content.parts[0].text,
          tool_call_id: `call_${generateId()}`
        });
      } else {
        messages.push({
          role,
          content: content.parts[0].text
        });
      }
    } else {
      // Multi-part or complex content
      const messageContent = convertPartsToOpenAIContent(content.parts);
      if (messageContent) {
        if (typeof messageContent === "string") {
          if (role === "tool") {
            messages.push({ 
              role, 
              content: messageContent,
              tool_call_id: `call_${generateId()}`
            });
          } else {
            messages.push({ role, content: messageContent });
          }
        } else if (content.parts[0].function_call) {
          // Function call
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `call_${generateId()}`,
              type: "function",
              function: {
                name: content.parts[0].function_call.name,
                arguments: JSON.stringify(content.parts[0].function_call.args)
              }
            }]
          });
        } else if (content.parts[0].function_response) {
          // Function response
          messages.push({
            role: "tool",
            content: JSON.stringify(content.parts[0].function_response.response),
            tool_call_id: `call_${generateId()}`
          });
        } else {
          // Multi-modal content
          if (role === "tool") {
            messages.push({
              role,
              content: messageContent,
              tool_call_id: `call_${generateId()}`
            } as ChatCompletionMessageParam);
          } else {
            messages.push({
              role,
              content: messageContent
            } as ChatCompletionMessageParam);
          }
        }
      }
    }
  }

  // Build OpenAI request
  const openAIReq: ChatCompletionCreateParams = {
    model,
    messages,
  };

  // Convert generation config
  if (geminiReq.generationConfig) {
    const config = geminiReq.generationConfig;
    if (config.temperature !== undefined) openAIReq.temperature = config.temperature;
    if (config.topP !== undefined) openAIReq.top_p = config.topP;
    if (config.maxOutputTokens !== undefined) openAIReq.max_tokens = config.maxOutputTokens;
    if (config.stopSequences) openAIReq.stop = config.stopSequences;
    if (config.candidateCount) openAIReq.n = config.candidateCount;
  }

  // Convert tools
  if (geminiReq.tools && geminiReq.tools.length > 0) {
    openAIReq.tools = [];
    for (const tool of geminiReq.tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          openAIReq.tools.push({
            type: "function",
            function: {
              name: func.name,
              description: func.description,
              parameters: func.parameters || {}
            }
          });
        }
      }
    }

    // Convert tool config
    if (geminiReq.toolConfig?.functionCallingConfig) {
      const mode = geminiReq.toolConfig.functionCallingConfig.mode;
      if (mode === "ANY") {
        openAIReq.tool_choice = "required";
      } else if (mode === "NONE") {
        openAIReq.tool_choice = "none";
      } else {
        openAIReq.tool_choice = "auto";
      }
    }
  }

  return openAIReq;
}

function mapGeminiRoleToOpenAI(role?: string): "system" | "user" | "assistant" | "tool" {
  switch (role) {
    case "user":
      return "user";
    case "model":
      return "assistant";
    case "function":
      return "tool";
    default:
      return "user";
  }
}

function extractTextFromParts(parts: GeminiPart[]): string {
  return parts
    .filter(part => part.text)
    .map(part => part.text)
    .join("\n");
}

function convertPartsToOpenAIContent(parts: GeminiPart[]): string | Array<any> | null {
  // If all parts are text, concatenate them
  if (parts.every(part => part.text)) {
    return parts.map(part => part.text).join("\n");
  }

  // Handle multi-modal content
  const content: Array<any> = [];
  for (const part of parts) {
    if (part.text) {
      content.push({ type: "text", text: part.text });
    } else if (part.inline_data) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`
        }
      });
    }
  }

  return content.length > 0 ? content : null;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}