import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";
import { selectApiKey } from "../shared/select-api-key";
import type {
  MessageCreateParams as ClaudeMessageCreateParams,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { claudeToOpenAIResponse, claudeToOpenAIStream } from "./openai-response-adapter";

export function buildClaudeAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<ClaudeMessageCreateParams, OpenAIResponse | ResponseStreamEvent> {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Anthropic API key (configure provider.apiKey or api.keyByModelPrefix)");
  const resolvedKey: string = apiKey;
  const anthropic = new Anthropic({ apiKey: resolvedKey, baseURL: provider.baseURL });

  return {
    name: "claude",
    async generate(params) {
      const body: ClaudeMessageCreateParams = { ...(params.input as ClaudeMessageCreateParams), model: params.model };
      const claudeResp = await anthropic.messages.create(
        { ...body, stream: false },
        params.signal ? { signal: params.signal } : undefined
      );
      // Map Claude JSON to OpenAI Responses JSON
      return claudeToOpenAIResponse(claudeResp as any, body.model as string);
    },
    async *stream(params) {
      const body: ClaudeMessageCreateParams = { ...(params.input as ClaudeMessageCreateParams), model: params.model, stream: true };
      const streamAny = (await anthropic.messages.create(
        body,
        params.signal ? { signal: params.signal } : undefined
      )) as unknown as AsyncIterable<import("@anthropic-ai/sdk/resources/messages").MessageStreamEvent>;
      // Re-yield as OpenAI Response stream events
      for await (const ev of claudeToOpenAIStream(streamAny, body.model as string)) {
        yield ev;
      }
    },
    async listModels() {
      const models = await anthropic.models.list();
      const data = models.data.map((m) => ({ id: m.id, object: "model" as const }));
      return { object: "list" as const, data };
    },
  };
}
