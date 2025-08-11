import type { ErrorHandler } from "hono";
import { isErrorWithStatus } from "./error-helpers";
import { toErrorBody, type ErrorEnvelope } from "../../../adapters/errors/error-converter";

export function createGlobalErrorHandler(envelope: ErrorEnvelope = "claude"): ErrorHandler {
  return (err, c) => {
    console.error("Global error handler:", err);
    const status = isErrorWithStatus(err) ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";

    const body = toErrorBody(envelope, message);
    return c.json(body as never, status as Parameters<typeof c.json>[1]);
  };
}
