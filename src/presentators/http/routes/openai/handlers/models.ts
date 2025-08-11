import type { Context } from "hono";
import type { RoutingConfig, Provider } from "../../../../../config/types";
import { buildProviderClient } from "../../../../../execution/routing-config";

function pickDefaultProvider(cfg: RoutingConfig): Provider | undefined {
  const id = cfg.defaults?.providerId || "default";
  const provider = cfg.providers?.[id];
  if (provider) return provider;
  const first = cfg.providers && Object.values(cfg.providers)[0];
  return first;
}

export const createModelsHandler = (routingConfig: RoutingConfig) => async (c: Context) => {
  const provider = pickDefaultProvider(routingConfig);
  if (!provider) {
    return c.json({ object: "list", data: [] });
  }
  try {
    const client = buildProviderClient(provider);
    const list = await client.models.list();
    const data = (list?.data || []).map((m) => ({ id: m.id, object: "model", created: Date.now(), owned_by: provider.type }));
    return c.json({ object: "list", data });
  } catch (err) {
    console.warn("Failed to list models; falling back to empty list:", err);
    return c.json({ object: "list", data: [] });
  }
};
