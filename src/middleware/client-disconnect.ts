import type { Context, Next } from "hono";

/**
 * Hono middleware that detects client disconnection and provides an AbortController
 * to cancel ongoing operations when the client disconnects.
 * 
 * This middleware adds an AbortController to the context that will be aborted
 * when the client connection is closed (TCP disconnect).
 */
export async function clientDisconnectMiddleware(c: Context, next: Next) {
  const abortController = new AbortController();
  const requestId = c.get("requestId") || "unknown";
  
  // Store the AbortController in context for downstream handlers
  c.set("abortController", abortController);
  
  // Get the raw request object
  const req = c.req.raw;
  
  // Handle client disconnect for Node.js environments
  // Type guard for Node.js request with event emitter
  interface NodeRequest extends Request {
    on?(event: string, listener: () => void): void;
    complete?: boolean;
  }
  
  const nodeReq = req as NodeRequest;
  if (nodeReq.on && typeof nodeReq.on === 'function') {
    nodeReq.on('close', () => {
      if (!nodeReq.complete) {
        console.log(`[Request ${requestId}] Client disconnected (TCP close)`);
        abortController.abort();
      }
    });
  }
  
  // For environments where the request has an abort signal
  // Check if the request itself has a signal that we can listen to
  const reqWithSignal = req as Request & { signal?: AbortSignal };
  if (reqWithSignal.signal && reqWithSignal.signal instanceof AbortSignal) {
    reqWithSignal.signal.addEventListener('abort', () => {
      console.log(`[Request ${requestId}] Request aborted by client signal`);
      abortController.abort();
    });
  }
  
  await next();
}

/**
 * Type augmentation for Hono context to include the AbortController
 */
declare module "hono" {
  interface ContextVariableMap {
    abortController: AbortController;
  }
}