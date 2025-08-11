import type { Context, Next } from "hono";

export async function clientDisconnectMiddleware(c: Context, next: Next) {
  const abortController = new AbortController();
  const requestId = c.get("requestId") || "unknown";

  c.set("abortController", abortController);

  const req = c.req.raw;

  interface NodeRequest extends Request {
    on?(event: string, listener: () => void): void;
    complete?: boolean;
  }

  const nodeReq = req as NodeRequest;
  if (nodeReq.on && typeof nodeReq.on === "function") {
    nodeReq.on("close", () => {
      if (!nodeReq.complete) {
        console.log(`[Request ${requestId}] Client disconnected (TCP close)`);
        abortController.abort();
      }
    });
  }

  const reqWithSignal = req as Request & { signal?: AbortSignal };
  if (reqWithSignal.signal && reqWithSignal.signal instanceof AbortSignal) {
    reqWithSignal.signal.addEventListener("abort", () => {
      console.log(`[Request ${requestId}] Request aborted by client signal`);
      abortController.abort();
    });
  }

  await next();
}

declare module "hono" {
  interface ContextVariableMap {
    abortController: AbortController;
  }
}

