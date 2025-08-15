import type { Context } from "hono";
import type { RoutingConfig } from "../../../../../config/types";
import { selectProvider } from "../../../../../execution/provider-selection";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";

// Ollama-like tags listing for OpenAI-compatible providers
export const createTagsHandler = (routingConfig: RoutingConfig) => async (c: Context) => {
  const requestId = c.get("requestId");
  const method = c.req.header("x-stainless-helper-method");
  const stream = method === "stream";
  console.log(`\n    🟢 [Request ${requestId}] new /api/tags stream=${stream} at ${new Date().toISOString()}`);

  const { providerId } = selectProvider(routingConfig, {
    toolNames: [],
    // No explicit model for tags; rely on defaults
    defaultModel: "gpt-4o-mini",
  });
  const provider = routingConfig.providers?.[providerId];
  if (!provider) {
    return c.json({ tags: [] });
  }
  const client = buildOpenAICompatibleClient(provider);
  const models = await client.models.list();
  return c.json({
    models: models.data.map((tag) => ({
      name: tag.id,
      model: tag.id,
      modified_at: new Date(tag.created * 1000).toISOString(),
      size: 0,
      digest: tag.id,
      details: {
        parent_model: "",
        format: "openai",
        family: "openai",
        families: ["openai"],
        parameter_size: "unknown",
        quantization_level: "unknown",
      },
    })),
  });
};
