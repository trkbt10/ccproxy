// Minimal Grok (x.ai) to OpenAI Responses compatibility adapter
import type {
  OpenAICompatResponse,
  OpenAICompatStreamEvent,
} from "../openai-responses/compat";
import type { GrokChatCompletion, GrokToolCall } from "./guards";

// Non-stream: map chat.completions-style response to OpenAI Responses
export function grokToOpenAIResponse(
  resp: GrokChatCompletion,
  model = "grok"
): OpenAICompatResponse {
  const text = resp?.choices?.[0]?.message?.content || "";
  const toolCalls = Array.isArray(resp?.choices?.[0]?.message?.tool_calls)
    ? (resp.choices![0]!.message!.tool_calls as GrokToolCall[])
    : [];

  const output: NonNullable<OpenAICompatResponse["output"]> = [];
  if (text) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    });
  }
  for (const tc of toolCalls) {
    if (
      tc &&
      tc.type === "function" &&
      tc.function &&
      typeof tc.function.name === "string"
    ) {
      output.push({
        type: "function_call",
        id: tc.id || undefined,
        name: tc.function.name,
        arguments:
          typeof tc.function.arguments === "string"
            ? tc.function.arguments
            : undefined,
        call_id: tc.id || undefined,
      });
    }
  }

  return {
    id: resp?.id || `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: "completed",
    output,
    usage: {
      input_tokens: resp?.usage?.prompt_tokens || 0,
      output_tokens: resp?.usage?.completion_tokens || 0,
    },
  };
}

// Stream: map chat.completion.chunk stream to Responses events
export async function* grokToOpenAIStream(
  src: AsyncIterable<GrokChatCompletion>
): AsyncGenerator<OpenAICompatStreamEvent, void, unknown> {
  const id = `resp_${Date.now()}`;
  yield { type: "response.created", response: { id, status: "in_progress" } };
  let sawText = false;
  let emittedFunctionId: string | undefined;
  let emittedFunctionName: string | undefined;
  for await (const chunk of src) {
    const choice = chunk?.choices?.[0];
    const deltaText = choice?.delta?.content || "";
    if (deltaText) {
      sawText = true;
      yield { type: "response.output_text.delta", delta: deltaText };
    }
    const toolCalls = (choice?.delta?.tool_calls || []) as GrokToolCall[];
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (!emittedFunctionId) {
        emittedFunctionId = call.id;
        emittedFunctionName = call.function?.name;
        if (emittedFunctionName) {
          yield {
            type: "response.output_item.added",
            item: {
              type: "function_call",
              id: emittedFunctionId,
              call_id: emittedFunctionId,
              name: emittedFunctionName,
            },
          };
        }
      }
      const args = call.function?.arguments;
      if (args && emittedFunctionName) {
        yield {
          type: "response.function_call_arguments.delta",
          item_id: emittedFunctionId,
          delta: args,
        };
        yield {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            id: emittedFunctionId,
            call_id: emittedFunctionId,
            name: emittedFunctionName,
            arguments: args,
          },
        };
      }
    }
    const finish = choice?.finish_reason;
    if (finish) break;
  }
  if (sawText) {
    yield { type: "response.output_text.done" };
  }
  yield { type: "response.completed", response: { id, status: "completed" } };
}
