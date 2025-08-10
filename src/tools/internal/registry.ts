export interface InternalToolContext {
  conversationId?: string;
  requestId?: string;
}

export interface InternalToolHandler {
  name: string;
  canHandle: (toolName: string) => boolean;
  execute: (toolName: string, input: unknown, context: InternalToolContext) => string | object;
}

const handlers: InternalToolHandler[] = [];

export function registerHandler(h: InternalToolHandler) {
  handlers.push(h);
}

export function findHandler(toolName: string): InternalToolHandler | undefined {
  return handlers.find((h) => h.canHandle(toolName));
}

// Built-in simple handlers ----------------------------------------------------

registerHandler({
  name: "echo",
  canHandle: (toolName) => toolName === "echo" || toolName === "noop",
  execute(_toolName, input) {
    return typeof input === "string" ? input : JSON.stringify(input);
  },
});

// Example stub: text_editor (no filesystem writes here by default)
registerHandler({
  name: "text_editor",
  canHandle: (toolName) => toolName === "text_editor",
  execute(_toolName, input) {
    // In production, implement actual diff/apply logic with safety checks
    return {
      status: "ok",
      message: "text_editor handled internally (stub)",
      input,
    };
  },
});
