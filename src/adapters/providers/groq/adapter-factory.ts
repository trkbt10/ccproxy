import OpenAI from "openai";
import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";

function selectApiKey(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string
): string | null {
  const keyFromProvider = provider.apiKey;
  const keyHeader = provider.api?.keyHeader;
  const keyId = keyHeader ? getHeader(keyHeader) : null;
  const keyFromMap = keyId ? provider.api?.keys?.[keyId] : null;
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
  const envKey = process.env["GROQ_API_KEY"] || null;
  return keyFromProvider || keyFromMap || keyFromModel || envKey || null;
}

export function buildGroqAdapter(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string
): ProviderAdapter<
  Parameters<OpenAI["responses"]["create"]>[0],
  Awaited<ReturnType<OpenAI["responses"]["create"]>>
> {
  const apiKey = selectApiKey(provider, getHeader, modelHint);
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

