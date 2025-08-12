import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import type { RoutingConfig, Step } from "../config/types";
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
  // Model is determined by tool step or env/defaults; no header override
  const overrideModel = undefined;

  // Check tool-specific provider settings
  const toolNames = extractToolNames(req);
  for (const name of toolNames) {
    const steps = planToolExecution(cfg, name, undefined);
    for (const s of steps) {
      if (s.kind === "responses_model") {
        const providerId =
          s.providerId || cfg.defaults?.providerId || "default";
        const model = s.model || cfg.defaults?.model || "gpt-4o-mini";

        // Verify provider exists if not using default
        if (
          providerId !== "default" &&
          cfg.providers &&
          !cfg.providers[providerId]
        ) {
          throw new Error(`Provider '${providerId}' not found in providers`);
        }

        return { providerId, model };
      }
    }
  }

  // Use default provider
  // Determine providerId: explicit defaults -> 'default' -> only provider name if exactly one defined
  const providers = cfg.providers || {};
  const providerId = cfg.defaults?.providerId
    ? cfg.defaults.providerId
    : providers["default"]
    ? "default"
    : Object.keys(providers).length === 1
    ? Object.keys(providers)[0]
    : "default";
  const model = cfg.defaults?.model || "gpt-4o-mini";
  return { providerId, model };
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
