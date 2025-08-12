import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams as OpenAIResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient, ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import { selectApiKey } from "../shared/select-api-key";
import { isResponseEventStream } from "../openai-generic/guards";

// API key selection centralized in shared/select-api-key

export function buildOpenAIAdapter(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const resolvedKey = selectApiKey(provider, modelHint);
  if (!resolvedKey) throw new Error("Missing OpenAI API key");
  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL: provider.baseURL,
    defaultHeaders: provider.defaultHeaders,
  });
  const openAIClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: client.chat.completions.create.bind(client.chat.completions) as ChatCompletionsCreateFn,
      },
    },
    responses: {
      create: client.responses.create.bind(client.responses) as ResponsesCreateFn,
    },
    models: {
      async list() {
        const res = await client.models.list();
        return { data: res.data.map((m) => ({ id: m.id })) };
      },
    },
  };
  
  return openAIClient;
}
