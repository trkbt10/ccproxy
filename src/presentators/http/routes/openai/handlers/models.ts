import type { Context } from "hono";

export const modelsHandler = async (c: Context) => {
  const models = [
    { id: "gpt-4", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "gpt-4-turbo", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "gpt-4o", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "gpt-3.5-turbo", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "claude-3-5-sonnet-20241022", object: "model", created: Date.now(), owned_by: "anthropic" },
    { id: "claude-3-opus-20240229", object: "model", created: Date.now(), owned_by: "anthropic" },
    { id: "claude-3-sonnet-20240229", object: "model", created: Date.now(), owned_by: "anthropic" },
    { id: "claude-3-haiku-20240307", object: "model", created: Date.now(), owned_by: "anthropic" },
  ];
  return c.json({ object: "list", data: models });
};

