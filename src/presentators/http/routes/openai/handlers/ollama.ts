import type { Context } from "hono";
import { stream } from "hono/streaming";
import type { RoutingConfig } from "../../../../../config/types";
import { selectProvider } from "../../../../../execution/provider-selection";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "../../../../../adapters/providers/openai-client-types";

type GenerateRequest = {
  model?: string;
  prompt: string;
  stream?: boolean;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatRequest = {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

export const createOllamaGenerateHandler = (routing: RoutingConfig) => async (c: Context) => {
  const req = (await c.req.json()) as GenerateRequest;
  const { providerId, model } = selectProvider(routing, {
    explicitModel: req.model,
    toolNames: [],
    defaultModel: "gpt-4o-mini",
  });
  const provider = routing.providers?.[providerId];
  if (!provider) return c.json({ model, response: "", done: true, created_at: nowIso() });
  const client = buildOpenAICompatibleClient(provider, model);

  if (req.stream) {
    return stream(c, async (s) => {
      const params: ChatCompletionCreateParamsStreaming = {
        model,
        stream: true,
        messages: [{ role: "user", content: req.prompt }],
      };
      const ai = await client.chat.completions.create(params);
      let text = "";
      for await (const chunk of ai) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (!delta) continue;
        text += delta;
        await s.writeln(
          JSON.stringify({ model, created_at: nowIso(), response: delta, done: false })
        );
      }
      await s.writeln(
        JSON.stringify({ model, created_at: nowIso(), response: text, done: true })
      );
    });
  }

  const params: ChatCompletionCreateParamsNonStreaming = {
    model,
    stream: false,
    messages: [{ role: "user", content: req.prompt }],
  };
  const completion = await client.chat.completions.create(params);
  const content = completion.choices?.[0]?.message?.content ?? "";
  return c.json({ model, created_at: nowIso(), response: content, done: true });
};

export const createOllamaChatHandler = (routing: RoutingConfig) => async (c: Context) => {
  const req = (await c.req.json()) as ChatRequest;
  const { providerId, model } = selectProvider(routing, {
    explicitModel: req.model,
    toolNames: [],
    defaultModel: "gpt-4o-mini",
  });
  const provider = routing.providers?.[providerId];
  if (!provider) return c.json({ model, created_at: nowIso(), message: { role: "assistant", content: "" }, done: true });
  const client = buildOpenAICompatibleClient(provider, model);

  // Map messages directly (Ollama format is close to OpenAI)
  const messages = req.messages?.map((m) => ({ role: m.role, content: m.content })) ?? [];

  if (req.stream) {
    return stream(c, async (s) => {
      const params: ChatCompletionCreateParamsStreaming = {
        model,
        stream: true,
        messages,
      };
      const ai = await client.chat.completions.create(params);
      let text = "";
      for await (const chunk of ai) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (!delta) continue;
        text += delta;
        await s.writeln(
          JSON.stringify({ model, created_at: nowIso(), message: { role: "assistant", content: delta }, done: false })
        );
      }
      await s.writeln(
        JSON.stringify({ model, created_at: nowIso(), message: { role: "assistant", content: text }, done: true })
      );
    });
  }

  const params: ChatCompletionCreateParamsNonStreaming = { model, stream: false, messages };
  const completion = await client.chat.completions.create(params);
  const content = completion.choices?.[0]?.message?.content ?? "";
  return c.json({ model, created_at: nowIso(), message: { role: "assistant", content: content }, done: true });
};

// ============ Additional Ollama-specific handlers ============

export const createOllamaEmbeddingsHandler = (_routing: RoutingConfig) => async (c: Context) => {
  // Not supported by our generic OpenAI-compatible adapter surface
  return c.json({ error: "not_implemented", message: "Embeddings not supported by this proxy" }, 501);
};

export const createOllamaPullHandler = (_routing: RoutingConfig) => async (c: Context) => {
  const body = await c.req.json().catch(() => ({} as { name?: string; stream?: boolean }));
  const name = (body as { name?: string }).name || "";
  const doStream = (body as { stream?: boolean }).stream === true;
  if (doStream) {
    return stream(c, async (s) => {
      await s.writeln(JSON.stringify({ status: "starting", digest: name, total: 1, completed: 0 }));
      await s.writeln(JSON.stringify({ status: "error", message: "pull not supported by this proxy" }));
    });
  }
  return c.json({ status: "error", message: "pull not supported by this proxy" }, 501);
};

export const createOllamaCreateHandler = (_routing: RoutingConfig) => async (c: Context) => {
  const body = await c.req.json().catch(() => ({}));
  const doStream = (body as { stream?: boolean }).stream === true;
  if (doStream) {
    return stream(c, async (s) => {
      await s.writeln(JSON.stringify({ status: "starting" }));
      await s.writeln(JSON.stringify({ status: "error", message: "create not supported by this proxy" }));
    });
  }
  return c.json({ status: "error", message: "create not supported by this proxy" }, 501);
};

export const createOllamaDeleteHandler = (_routing: RoutingConfig) => async (c: Context) => {
  return c.json({ status: "error", message: "delete not supported by this proxy" }, 501);
};

export const createOllamaCopyHandler = (_routing: RoutingConfig) => async (c: Context) => {
  return c.json({ status: "error", message: "copy not supported by this proxy" }, 501);
};

export const createOllamaPsHandler = (_routing: RoutingConfig) => async (c: Context) => {
  // No runtime manager of loaded models in this proxy
  return c.json({ models: [] });
};

export const createOllamaShowHandler = (routing: RoutingConfig) => async (c: Context) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  const name = body.name || "";
  // Use default provider to query models
  const { providerId } = selectProvider(routing, { defaultModel: "gpt-4o-mini" });
  const provider = routing.providers?.[providerId];
  if (!provider) return c.json({ error: "not_found", message: "no provider configured" }, 404);
  const client = buildOpenAICompatibleClient(provider);
  const models = await client.models.list();
  const m = models.data.find((it) => it.id === name);
  if (!m) return c.json({ error: "not_found", message: `model '${name}' not found` }, 404);
  const model = {
    name: m.id,
    model: m.id,
    modified_at: new Date(m.created * 1000).toISOString(),
    size: 0,
    digest: m.id,
    details: {
      parent_model: "",
      format: "openai",
      family: "openai",
      families: ["openai"],
      parameter_size: "unknown",
      quantization_level: "unknown",
    },
  };
  return c.json(model);
};
