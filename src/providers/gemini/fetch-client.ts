/**
 * Minimal, fetch-based Gemini client using Web APIs only.
 * Targets Generative Language API v1beta endpoints.
 * Docs: https://ai.google.dev/api/rest/v1beta/models
 */
export type GeminiClientOptions = {
  apiKey: string;
  baseURL?: string; // default https://generativelanguage.googleapis.com
  fetchImpl?: typeof fetch; // for testing/override
};

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: unknown } }
  | { functionResponse: { name: string; response?: unknown } };

export type GeminiContent = {
  role?: "user" | "model" | "function";
  parts: GeminiPart[];
};

export type GenerateContentRequest = {
  contents: GeminiContent[];
  tools?: unknown[];
  toolConfig?: unknown;
  safetySettings?: unknown[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
};

export type GenerateContentResponse = {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

// Models
export type GeminiModel = {
  name: string; // e.g. models/gemini-1.5-pro
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

export type ListModelsResponse = { models: GeminiModel[] };

// Count tokens
export type CountTokensRequest = {
  contents: GeminiContent[];
};
export type CountTokensResponse = {
  totalTokens?: number; // alias
  totalTokenCount?: number;
};

// Embeddings
export type EmbedContentRequest = {
  content: GeminiContent;
  taskType?: string;
};
export type EmbedContentResponse = { embedding?: { value?: number[] } };

export type BatchEmbedContentsRequest = {
  requests: EmbedContentRequest[];
};
export type BatchEmbedContentsResponse = {
  embeddings?: Array<{ embedding?: { value?: number[] } }>;
};

export class GeminiFetchClient {
  private apiKey: string;
  private baseURL: string;
  private f: typeof fetch;

  constructor(opts: GeminiClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseURL = (opts.baseURL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    this.f = opts.fetchImpl || fetch;
  }

  async generateContent(model: string, body: GenerateContentRequest, abortSignal?: AbortSignal): Promise<GenerateContentResponse> {
    const url = new URL(`${this.baseURL}/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }
    return (await res.json()) as GenerateContentResponse;
  }

  async *streamGenerateContent(model: string, body: GenerateContentRequest, abortSignal?: AbortSignal): AsyncGenerator<GenerateContentResponse, void, unknown> {
    const url = new URL(`${this.baseURL}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini stream error ${res.status}: ${text}`);
    }
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Support either JSON per line or SSE-style "data: <json>\n\n"
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const payload = parseStreamChunk(chunk);
        if (payload) yield payload;
      }
      // Also handle single newlines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const payload = parseStreamChunk(line);
        if (payload) yield payload;
      }
    }
    if (buffer.trim().length > 0) {
      const payload = parseStreamChunk(buffer.trim());
      if (payload) yield payload;
    }
  }

  async listModels(): Promise<ListModelsResponse> {
    const url = new URL(`${this.baseURL}/v1beta/models`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`Gemini list models ${res.status}`);
    return (await res.json()) as ListModelsResponse;
  }

  async getModel(name: string): Promise<GeminiModel> {
    const url = new URL(`${this.baseURL}/v1beta/${encodeURIComponent(name)}`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`Gemini get model ${res.status}`);
    return (await res.json()) as GeminiModel;
  }

  async countTokens(model: string, body: CountTokensRequest, abortSignal?: AbortSignal): Promise<CountTokensResponse> {
    const url = new URL(`${this.baseURL}/v1beta/models/${encodeURIComponent(model)}:countTokens`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) throw new Error(`Gemini count tokens ${res.status}`);
    const json = (await res.json()) as CountTokensResponse;
    if (json.totalTokenCount && !json.totalTokens) json.totalTokens = json.totalTokenCount;
    return json;
  }

  async embedContent(model: string, body: EmbedContentRequest, abortSignal?: AbortSignal): Promise<EmbedContentResponse> {
    const url = new URL(`${this.baseURL}/v1beta/models/${encodeURIComponent(model)}:embedContent`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) throw new Error(`Gemini embed content ${res.status}`);
    return (await res.json()) as EmbedContentResponse;
  }

  async batchEmbedContents(model: string, body: BatchEmbedContentsRequest, abortSignal?: AbortSignal): Promise<BatchEmbedContentsResponse> {
    const url = new URL(`${this.baseURL}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`);
    url.searchParams.set("key", this.apiKey);
    const res = await this.f(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) throw new Error(`Gemini batch embed ${res.status}`);
    return (await res.json()) as BatchEmbedContentsResponse;
  }
}

function parseStreamChunk(chunk: string): GenerateContentResponse | null {
  const line = chunk.trim();
  if (!line) return null;
  // strip SSE prefix
  const dataPrefix = /^data:\s*/i;
  const jsonText = dataPrefix.test(line) ? line.replace(dataPrefix, "") : line;
  try {
    return JSON.parse(jsonText) as GenerateContentResponse;
  } catch {
    return null;
  }
}
