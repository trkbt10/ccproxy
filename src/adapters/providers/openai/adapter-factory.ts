import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient, ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import { selectApiKey } from "../shared/select-api-key";

export function buildOpenAIAdapter(provider: Provider, modelHint?: string): OpenAICompatibleClient {
  const resolvedKey = selectApiKey(provider, modelHint);
  if (!resolvedKey) throw new Error("Missing OpenAI API key");
  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL: provider.baseURL,
    defaultHeaders: { "OpenAI-Beta": "responses-2025-06-21", ...provider.defaultHeaders },
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
        return { 
          data: res.data.map((m) => ({ 
            id: m.id,
            object: m.object,
            created: m.created,
            owned_by: m.owned_by
          })) 
        };
      },
    },
  };

  return openAIClient;
}
