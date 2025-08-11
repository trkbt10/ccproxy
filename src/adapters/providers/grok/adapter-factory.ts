import type { Provider } from "../../../config/types";
import type { ProviderAdapter, GenerateParams } from "../adapter";

export function selectApiKey(
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
  const envKey = process.env["GROK_API_KEY"] || null;
  return keyFromProvider || keyFromMap || keyFromModel || envKey || null;
}

function parseSSELine(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const dataPrefix = /^data:\s*/i;
  const payload = dataPrefix.test(trimmed)
    ? trimmed.replace(dataPrefix, "")
    : trimmed;
  if (payload === "[DONE]") return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function buildGrokAdapter(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string
): ProviderAdapter<any, any> {
  const baseURL = provider.baseURL || "https://api.x.ai/v1";
  const apiKey = selectApiKey(provider, getHeader, modelHint);
  if (!apiKey) throw new Error("Missing Grok API key");
  const adapter: ProviderAdapter<any, any> = {
    name: "grok",
    async generate({ input, signal }: GenerateParams<any>) {
      const url = new URL(baseURL.replace(/\/$/, "") + "/chat/completions");
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(input),
        signal,
      });
      if (!res.ok) throw new Error(`Grok API error ${res.status}`);
      return await res.json();
    },
    async *stream({ input, signal }: GenerateParams<any>) {
      const url = new URL(baseURL.replace(/\/$/, "") + "/chat/completions");
      const body = { ...input, stream: true };
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`Grok stream error ${res.status}: ${text}`);
      }
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          const payload = parseSSELine(raw);
          if (payload) yield payload;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const payload = parseSSELine(line);
          if (payload) yield payload;
        }
      }
      if (buffer.trim()) {
        const payload = parseSSELine(buffer.trim());
        if (payload) yield payload;
      }
    },
    async listModels() {
      const url = new URL(baseURL.replace(/\/$/, "") + "/models");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Grok models error ${res.status}`);
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      const data = (json.data || [])
        .map((m) => ({ id: m.id || "", object: "model" as const }))
        .filter((m) => m.id);
      return { object: "list" as const, data };
    },
  };
  return adapter;
}

