import type { ResponseStreamEvent as OpenAIResponseStreamEvent } from "openai/resources/responses/responses";
import type { MessageStreamEvent as ClaudeStreamEvent, MessageStartEvent } from "@anthropic-ai/sdk/resources/messages";
import { processOpenAIEvent } from "./event-reducer";
import type { ConversionState } from "./types";

export async function* openAIToClaudeStream(
  openAIStream: AsyncIterable<OpenAIResponseStreamEvent>,
  messageId: string
): AsyncGenerator<ClaudeStreamEvent> {
  // Initialize state
  let state: ConversionState = {
    messageId,
    contentBlocks: new Map(),
    currentIndex: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };

  // Process OpenAI events with reducer pattern
  for await (const event of openAIStream) {
    const result = processOpenAIEvent(state, event);
    state = result.state;

    // Yield all generated Claude events
    for (const claudeEvent of result.events) {
      yield claudeEvent;
    }
  }
}

export { openAIToClaudeStream as openAIToClaudeStreamV2 };
export { openAINonStreamToClaudeMessage } from "./from-nonstream";
