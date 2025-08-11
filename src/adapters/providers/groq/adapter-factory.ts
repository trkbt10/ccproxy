import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";

function selectApiKey(
  provider: Provider,
  modelHint?: string
): string | null {
  const keyFromProvider = provider.apiKey;
  const keyFromMap = null;
  let keyFromModel: string | null = null;
  if (modelHint && provider.api?.keyByModelPrefix) {
    const entries = Object.entries(provider.api.keyByModelPrefix).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [prefix, apiKey] of entries) {
      if (modelHint.startsWith(prefix)) {
        keyFromModel = apiKey;
        break;
      }
    }
  }
  return keyFromProvider || keyFromMap || keyFromModel || null;
}

export function buildGroqAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<
  Parameters<OpenAI["responses"]["create"]>[0],
  Awaited<ReturnType<OpenAI["responses"]["create"]>>
> {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Groq API key");
  const baseURL = provider.baseURL || "https://api.groq.com/v1";
  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: provider.defaultHeaders,
  });
  type Req = Parameters<OpenAI["responses"]["create"]>[0];
  return {
    name: "groq",
    async generate(params) {
      const body: Req = { ...params.input, model: params.model } as Req;
      return client.responses.create(
        body,
        params.signal ? { signal: params.signal } : undefined
      );
    },
    async listModels() {
      const res = await client.models.list();
      const data = res.data.map((m) => ({ id: m.id, object: "model" as const }));
      return { object: "list" as const, data };
    },
  };
}
