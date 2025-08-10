export interface InternalToolContext {
  conversationId?: string;
  requestId?: string;
}

export interface InternalToolHandler {
  name: string;
  canHandle: (toolName: string, input?: unknown) => boolean;
  execute: (toolName: string, input: unknown, context: InternalToolContext) => string | object;
}

const handlers: InternalToolHandler[] = [];

export function registerHandler(h: InternalToolHandler) {
  handlers.push(h);
}

export function findHandler(toolName: string): InternalToolHandler | undefined {
  return handlers.find((h) => h.name === toolName);
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
type TextEditorEdit = { path: string; find?: string; replace?: string };
type TextEditorInput = { action?: "preview" | "apply" | "plan"; edits?: TextEditorEdit[]; dryRun?: boolean };

registerHandler({
  name: "text_editor",
  canHandle: (toolName, input) => {
    if (toolName !== "text_editor") return false;
    const i = input as Partial<TextEditorInput> | null | undefined;
    const action = i?.action;
    const dryRun = i?.dryRun === true;
    const allowApply = process.env.ALLOW_INTERNAL_WRITES === "true";
    // Preview/plan/dryRun are safe to handle internally without FS writes
    if (dryRun || action === "preview" || action === "plan") return true;
    // Apply is only allowed when explicitly enabled
    if (action === "apply" && allowApply) return true;
    return false;
  },
  execute(_toolName, input) {
    const i = (input as Partial<TextEditorInput>) || {};
    const action = i.action ?? (i.dryRun ? "preview" : "plan");
    const edits = Array.isArray(i.edits) ? i.edits : [];

    // This stub does NOT write files by default.
    // It returns a preview/apply-intent payload to the model or caller.
    if (action === "apply" && process.env.ALLOW_INTERNAL_WRITES !== "true") {
      return {
        status: "declined",
        reason: "apply not allowed by default",
        proposedEdits: edits,
      };
    }

    return {
      status: action === "apply" ? "applied" : action,
      writesPerformed: 0,
      proposedEdits: edits,
      note: "No filesystem writes in default handler",
    };
  },
});
