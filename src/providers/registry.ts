import OpenAI from "openai";
import type { Provider } from "../config/types";
import type { ProviderAdapter, GenerateParams } from "./adapter";
import {
  GeminiFetchClient,
  type GenerateContentRequest,
  type GenerateContentResponse,
} from "./gemini/fetch-client";

export function selectApiKey(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string,
  envFallbackName?: string | string[]
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
  let envKey: string | null = null;
  if (envFallbackName) {
    if (Array.isArray(envFallbackName)) {
      for (const name of envFallbackName) {
        if (process.env[name]) {
          envKey = process.env[name]!;
          break;
        }
      }
    } else {
      envKey = process.env[envFallbackName] || null;
    }
  }
  return keyFromProvider || keyFromMap || keyFromModel || envKey || null;
}

export function getAdapterFor(
  provider: Provider,
  getHeader: (name: string) => string | null,
  modelHint?: string
): ProviderAdapter {
  switch (provider.type) {
    case "openai": {
      const apiKey = selectApiKey(
        provider,
        getHeader,
        modelHint,
        "OPENAI_API_KEY"
      );
      if (!apiKey) throw new Error("Missing OpenAI API key");
      const client = new OpenAI({
        apiKey,
        baseURL: provider.baseURL,
        defaultHeaders: provider.defaultHeaders,
      });
      const adapter: ProviderAdapter<
        Parameters<OpenAI["responses"]["create"]>[0],
        Awaited<ReturnType<OpenAI["responses"]["create"]>>
      > = {
        name: "openai",
        async generate(params) {
          return client.responses.create(
            { ...(params.input as any), model: params.model },
            params.signal ? { signal: params.signal } : undefined
          );
        },
        async listModels() {
          const res = await client.models.list();
          const data = res.data.map((m) => ({
            id: m.id,
            object: "model" as const,
          }));
          return { object: "list" as const, data };
        },
      };
      return adapter as ProviderAdapter;
    }
    case "groq": {
      const apiKey = selectApiKey(
        provider,
        getHeader,
        modelHint,
        "GROQ_API_KEY"
      );
      if (!apiKey) throw new Error("Missing Groq API key");
      const baseURL = provider.baseURL || "https://api.groq.com/v1";
      const client = new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders: provider.defaultHeaders,
      });
      const adapter: ProviderAdapter<
        Parameters<OpenAI["responses"]["create"]>[0],
        Awaited<ReturnType<OpenAI["responses"]["create"]>>
      > = {
        name: "groq",
        async generate(params) {
          return client.responses.create(
            { ...(params.input as any), model: params.model },
            params.signal ? { signal: params.signal } : undefined
          );
        },
        async listModels() {
          const res = await client.models.list();
          const data = res.data.map((m) => ({
            id: m.id,
            object: "model" as const,
          }));
          return { object: "list" as const, data };
        },
      };
      return adapter as ProviderAdapter;
    }
    case "gemini": {
      const apiKey = selectApiKey(provider, getHeader, modelHint, [
        "GEMINI_API_KEY",
        "GOOGLE_AI_STUDIO_API_KEY",
      ]);
      if (!apiKey) throw new Error("Missing Gemini API key");
      const client = new GeminiFetchClient({
        apiKey,
        baseURL: provider.baseURL,
      });
      const adapter: ProviderAdapter<
        GenerateContentRequest,
        GenerateContentResponse
      > = {
        name: "gemini",
        async generate(params) {
          return client.generateContent(
            params.model,
            params.input,
            params.signal
          );
        },
        async *stream(params) {
          let seenFunctionCall = false;
          let lastChunk: GenerateContentResponse | null = null;
          for await (const ev of client.streamGenerateContent(
            params.model,
            params.input,
            params.signal
          )) {
            lastChunk = ev;
            try {
              const parts = (ev.candidates?.[0]?.content?.parts || []) as Array<
                { functionCall?: { name?: string } } & Record<string, unknown>
              >;
              if (parts.some((p) => p && p.functionCall && typeof p.functionCall.name === "string")) {
                seenFunctionCall = true;
              }
            } catch {
              // ignore shape issues
            }
            yield ev;
          }
          // Synthesize a functionCall at the end when tools are forced but Gemini didn't stream any
          try {
            const anyConfig = (params.input as any)?.toolConfig?.functionCallingConfig;
            const allowed: string[] | undefined = anyConfig?.allowedFunctionNames;
            const mode: string | undefined = anyConfig?.mode;
            const fnName = Array.isArray(allowed) && allowed[0] ? String(allowed[0]) : undefined;
            if (!seenFunctionCall && fnName && (mode === "ANY" || mode === "AUTO")) {
              const synthetic: GenerateContentResponse = {
                candidates: [
                  {
                    content: {
                      parts: [
                        { functionCall: { name: fnName, args: {} } } as any,
                      ],
                    },
                  },
                ],
              };
              yield synthetic;
            }
          } catch {
            // ignore
          }
        },
        async countTokens(params) {
          return client.countTokens(
            params.model,
            params.input as any,
            params.signal
          );
        },
        async listModels() {
          const res = await client.listModels();
          const data = (res.models || [])
            .map((m) => {
              const id = m.name?.startsWith("models/")
                ? m.name.slice("models/".length)
                : m.name;
              return { id: id || "", object: "model" as const };
            })
            .filter((m) => m.id);
          return { object: "list" as const, data };
        },
      };
      return adapter as ProviderAdapter;
    }
    case "grok": {
      const baseURL = provider.baseURL || "https://api.x.ai/v1";
      const apiKey = selectApiKey(
        provider,
        getHeader,
        modelHint,
        "GROK_API_KEY"
      );
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
      return adapter as ProviderAdapter;
    }
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}

function parseSSELine(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // grok streams often as 'data: {json}'
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
