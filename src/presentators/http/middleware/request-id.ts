import type { Context, Next } from "hono";

export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = Math.random().toString(36).substring(7);
  c.set("requestId", requestId);
  await next();
}

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

