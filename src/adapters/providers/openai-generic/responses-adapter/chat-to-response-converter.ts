import type { 
  OpenAIResponse,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  ResponseOutputText
} from "./types";
import type { 
  ChatCompletion,
  ChatCompletionMessage,
  ChatCompletionMessageToolCall 
} from "openai/resources/chat/completions";
import { hasContent, hasToolCalls, isFunctionToolCall } from "./type-guards";

export const convertChatCompletionToResponse = (
  completion: ChatCompletion
): OpenAIResponse => {
  const message = completion.choices[0]?.message;
  if (!message) {
    throw new Error("No message in completion");
  }

  const output = buildOutputItems(message);
  const status = determineStatus(completion);
  const incompleteDetails = determineIncompleteDetails(completion);

  // Build the text content from output items
  const outputText = output
    .filter(item => item.type === "message")
    .map(item => {
      const msgItem = item as ResponseOutputMessage;
      return msgItem.content
        .filter(c => 'text' in c)
        .map(c => (c as ResponseOutputText).text)
        .join("");
    })
    .join("");

  return {
    id: completion.id,
    object: "response",
    model: completion.model as unknown as OpenAIResponse["model"],
    created_at: completion.created,
    output_text: outputText,
    error: null,
    incomplete_details: incompleteDetails ?? null,
    instructions: null,
    metadata: null,
    output,
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    usage: {
      input_tokens: completion.usage?.prompt_tokens ?? 0,
      output_tokens: completion.usage?.completion_tokens ?? 0,
      total_tokens: completion.usage?.total_tokens ?? 0,
      input_tokens_details: {
        cached_tokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
      output_tokens_details: {
        reasoning_tokens: completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      },
    },
    status,
  };
};

const buildOutputItems = (
  message: ChatCompletionMessage
): ResponseOutputItem[] => {
  const output: ResponseOutputItem[] = [];

  // Handle text content
  if (hasContent(message)) {
    const textOutput: ResponseOutputText = {
      type: "output_text",
      text: message.content,
      annotations: [],
    };

    const messageOutput: ResponseOutputMessage = {
      type: "message",
      id: generateId("msg"),
      content: [textOutput],
      role: "assistant",
      status: "completed",
    };

    output.push(messageOutput);
  }

  // Handle tool calls
  if (hasToolCalls(message)) {
    for (const toolCall of message.tool_calls) {
      const functionCall = createFunctionCall(toolCall);
      if (functionCall) {
        output.push(functionCall);
      }
    }
  }

  return output;
};

const createFunctionCall = (
  toolCall: ChatCompletionMessageToolCall
): ResponseFunctionToolCall | null => {
  // Check if this is a function tool call
  if (!isFunctionToolCall(toolCall)) {
    console.warn(`[WARN] Skipping non-function tool call: type=${toolCall.type}`);
    return null;
  }
  
  // Use the OpenAI tool call id as both id and call_id in Responses shape
  return {
    type: "function_call",
    id: toolCall.id,
    call_id: toolCall.id,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
  };
};

const determineStatus = (completion: ChatCompletion): "completed" | "incomplete" => {
  const finishReason = completion.choices[0]?.finish_reason;
  return finishReason === "length" ? "incomplete" : "completed";
};

const determineIncompleteDetails = (
  completion: ChatCompletion
): { reason: "max_output_tokens" } | undefined => {
  const finishReason = completion.choices[0]?.finish_reason;
  return finishReason === "length" ? { reason: "max_output_tokens" } : undefined;
};

const generateId = (prefix: string): string => {
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${prefix}_${randomPart}`;
};

