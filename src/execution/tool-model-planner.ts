import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import type { RoutingConfig, Step } from "../config/types";
import { selectProvider } from "./provider-selection";
import type { UnknownRecord } from "../types/common";

// Type guard for ClaudeMessageCreateParams
function hasMessagesArray(obj: unknown): obj is { messages: unknown[] } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "messages" in obj &&
    Array.isArray((obj as Record<string, unknown>).messages)
  );
}

// Type guard for message with content array
function hasContentArray(obj: unknown): obj is { content: unknown[] } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "content" in obj &&
    Array.isArray((obj as Record<string, unknown>).content)
  );
}

// Type guard for action input
function isActionInput(
  obj: unknown
): obj is { action?: unknown; dryRun?: unknown } {
  return typeof obj === "object" && obj !== null;
}

// Select the provider and model for the current request
export function selectProviderForRequest(
  cfg: RoutingConfig,
  req: ClaudeMessageCreateParams
): { providerId: string; model: string } {
  const toolNames = extractToolNames(req);
  return selectProvider(cfg, { toolNames, defaultModel: "gpt-4o-mini" });
}

// Create the execution plan (ordered steps) for a given tool and input
export function planToolExecution(
  cfg: RoutingConfig,
  toolName: string,
  input: unknown
): Step[] {
  const rule = cfg.tools?.find(
    (r) => r.enabled !== false && r.name === toolName
  );
  if (!rule || !rule.steps) {
    return [];
  }
  return rule.steps.filter((step) => matchesWhen(step, input));
}

function matchesWhen(step: Step, input: unknown): boolean {
  if (step.kind !== "internal" || !step.when) {
    return true;
  }
  const { actionIn } = step.when;
  if (actionIn && actionIn.length > 0) {
    const act = extractAction(input);
    if (!act || !actionIn.includes(act)) {
      return false;
    }
  }
  return true;
}

function extractToolNames(req: ClaudeMessageCreateParams): string[] {
  const result: string[] = [];

  if (!hasMessagesArray(req)) {
    return result;
  }

  for (const m of req.messages) {
    if (hasContentArray(m)) {
      for (const b of m.content) {
        if (isToolUseBlock(b)) result.push(b.name);
      }
    }
  }
  return result;
}

// Exported helper for external callers (Claude router) to unify extraction
export function extractToolNamesFromClaude(req: ClaudeMessageCreateParams): string[] {
  return extractToolNames(req);
}

type ToolUseShape = { type: "tool_use"; name: string };

function isToolUseBlock(b: unknown): b is ToolUseShape {
  if (typeof b !== "object" || b === null) {
    return false;
  }
  const rec = b as UnknownRecord;
  return rec.type === "tool_use" && typeof rec.name === "string";
}

function extractAction(
  input: unknown
): "preview" | "plan" | "apply" | undefined {
  if (!isActionInput(input)) {
    return undefined;
  }

  const a = input.action;
  if (a === "preview" || a === "plan" || a === "apply") {
    return a;
  }

  if (input.dryRun === true) {
    return "preview";
  }

  return undefined;
}
