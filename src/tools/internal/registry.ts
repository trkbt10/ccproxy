export interface InternalToolContext {
  conversationId?: string;
  requestId?: string;
}

export interface InternalToolHandler {
  name: string;
  canHandle: (toolName: string, input?: unknown) => boolean;
  execute: (
    toolName: string,
    input: unknown,
    context: InternalToolContext
  ) => string | object;
}

const handlers: InternalToolHandler[] = [];

export function registerHandler(h: InternalToolHandler) {
  handlers.push(h);
}

export function findHandler(toolName: string): InternalToolHandler | undefined {
  return handlers.find((h) => h.name === toolName);
}

import { echoHandler } from "./handlers/echo";
import { globHandler } from "./handlers/glob";
import { grepHandler } from "./handlers/grep";
import { lsHandler } from "./handlers/ls";
import { exitPlanModeHandler } from "./handlers/exitPlanMode";
import { taskHandler } from "./handlers/task";

// Register built-in handlers
registerHandler(echoHandler);
registerHandler(globHandler);
registerHandler(grepHandler);
registerHandler(lsHandler);
registerHandler(exitPlanModeHandler);
registerHandler(taskHandler);
