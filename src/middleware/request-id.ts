import type { Context, Next } from "hono";

/**
 * Hono middleware that generates and sets a unique request ID for each request.
 * The request ID is available in the context as `c.get("requestId")`.
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = Math.random().toString(36).substring(7);
  c.set("requestId", requestId);
  await next();
}

/**
 * Type augmentation for Hono context to include the request ID
 */
declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}