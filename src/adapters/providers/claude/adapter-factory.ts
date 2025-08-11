import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";
import { selectApiKey } from "../shared/select-api-key";
import type {
  MessageCreateParams as ClaudeMessageCreateParams,
  Message as ClaudeMessage,
} from "@anthropic-ai/sdk/resources/messages";

export function buildClaudeAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<ClaudeMessageCreateParams, ClaudeMessage> {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Anthropic API key (configure provider.apiKey or api.keyByModelPrefix)");
  const anthropic = new Anthropic({ apiKey, baseURL: provider.baseURL });

  return {
    name: "claude",
    async generate(params) {
      const body: ClaudeMessageCreateParams = { ...(params.input as ClaudeMessageCreateParams), model: params.model };
      return anthropic.messages.create(body, params.signal ? { signal: params.signal } : undefined) as unknown as ClaudeMessage;
    },
    async *stream(params) {
      const body: ClaudeMessageCreateParams = { ...(params.input as ClaudeMessageCreateParams), model: params.model, stream: true };
      const streamAny = (await anthropic.messages.create(
        body,
        params.signal ? { signal: params.signal } : undefined
      )) as unknown as AsyncIterable<unknown>;
      for await (const ev of streamAny) {
        yield ev as unknown as ClaudeMessage; // pass-through events; caller should adapt
      }
    },
    async listModels() {
      const models = await anthropic.models.list();
      const data = models.data.map((m) => ({ id: m.id, object: "model" as const }));
      return { object: "list" as const, data };
    },
  };
}
