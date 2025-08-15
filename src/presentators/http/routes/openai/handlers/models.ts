import type { Context } from "hono";
import type { RoutingConfig } from "../../../../../config/types";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";
import { selectProvider } from "../../../../../execution/provider-selection";

export const createModelsHandler = (routingConfig: RoutingConfig) => async (c: Context) => {
  const { providerId } = selectProvider(routingConfig, { defaultModel: "gpt-4o-mini" });
  const provider = routingConfig.providers?.[providerId];
  if (!provider) {
    return c.json({ object: "list", data: [] });
  }
  try {
    const client = buildOpenAICompatibleClient(provider);
    const list = await client.models.list();
    const data = (list?.data || []).map((m) => ({
      id: m.id,
      object: "model",
      // OpenAI returns epoch seconds; align our synthetic timestamp
      created: Math.floor(Date.now() / 1000),
      owned_by: provider.type,
    }));
    return c.json({ object: "list", data });
  } catch (err) {
    console.warn("Failed to list models; falling back to empty list:", err);
    return c.json({ object: "list", data: [] });
  }
};
