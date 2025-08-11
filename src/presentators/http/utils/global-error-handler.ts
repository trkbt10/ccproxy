import type { ErrorHandler } from "hono";
import { isErrorWithStatus } from "./error-helpers";
import { toErrorBody, type ErrorEnvelope } from "../../../adapters/errors/error-converter";

function mapErrorType(err: unknown, status: number): string | undefined {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'string' && code.trim()) return code;
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  if (status >= 400) return 'bad_request';
  return undefined;
}

export function createGlobalErrorHandler(envelope: ErrorEnvelope = "claude"): ErrorHandler {
  return (err, c) => {
    console.error("Global error handler:", err);
    const status = isErrorWithStatus(err) ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    const type = mapErrorType(err, status);

    const body = toErrorBody(envelope, message, type);
    return c.json(body as never, status as Parameters<typeof c.json>[1]);
  };
}
