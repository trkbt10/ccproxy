import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";

export type WhenClause = {
  actionIn?: ("preview" | "plan" | "apply")[];
};

export type InternalStep = {
  kind: "internal";
  handler: string;
  when?: WhenClause;
  stopOn?: "handled" | "always" | "never";
};

export type ResponsesModelStep = {
  kind: "responses_model";
  providerId?: string;
  model?: string;
};

export type Step = InternalStep | ResponsesModelStep;

export type ToolRule = {
  name: string;
  enabled?: boolean;
  steps: Step[];
};

export type Provider = {
  type: "openai" | "claude" | "gemini";
  baseURL?: string;
  apiKey?: string;
  api?: {
    keys?: Record<string, string>;
    keyHeader?: string;
    keyByModelPrefix?: Record<string, string>;
  };
  defaultHeaders?: Record<string, string>;
  instruction?: InstructionConfig;
};

export type PatternReplacement = {
  regex: string;
  replace: string;
};

export type InstructionConfig = {
  text?: string;
  mode: "override" | "append" | "prepend" | "replace";
  patterns?: PatternReplacement[]; // Only used when mode is "replace"
};

export type RoutingConfig = {
  providers?: Record<string, Provider>;
  tools?: ToolRule[];
  instruction?: InstructionConfig;
};

// Select the provider and model for the current request
export function selectProviderForRequest(
  cfg: RoutingConfig,
  req: ClaudeMessageCreateParams,
  getHeader: (name: string) => string | null
): { providerId: string; model: string } {
  const overrideModel = getHeader("x-openai-model");
  
  // Check tool-specific provider settings
  const toolNames = extractToolNames(req);
  for (const name of toolNames) {
    const steps = planToolExecution(cfg, name, undefined);
    for (const s of steps) {
      if (s.kind === "responses_model") {
        const providerId = s.providerId || "default";
        const model = overrideModel || s.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
        
        // Verify provider exists if not using default
        if (providerId !== "default" && cfg.providers && !cfg.providers[providerId]) {
          throw new Error(`Provider '${providerId}' not found in providers`);
        }
        
        return { providerId, model };
      }
    }
  }
  
  // Use default provider
  return {
    providerId: "default",
    model: overrideModel || process.env.OPENAI_MODEL || "gpt-4.1-mini"
  };
}

// Create the execution plan (ordered steps) for a given tool and input
export function planToolExecution(cfg: RoutingConfig, toolName: string, input: unknown): Step[] {
  const rule = cfg.tools?.find((r) => r.enabled !== false && r.name === toolName);
  if (!rule || !rule.steps) return [];
  return rule.steps.filter((step) => matchesWhen(step, input));
}

function matchesWhen(step: Step, input: unknown): boolean {
  if (step.kind !== "internal" || !step.when) return true;
  const { actionIn } = step.when;
  if (actionIn && actionIn.length > 0) {
    const act = extractAction(input);
    if (!act || !actionIn.includes(act)) return false;
  }
  return true;
}

function extractToolNames(req: ClaudeMessageCreateParams): string[] {
  const result: string[] = [];
  for (const m of req.messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (isToolUseBlock(b)) result.push(b.name);
      }
    }
  }
  return result;
}

type UnknownBlock = Record<string, unknown>;
type ToolUseShape = { type: "tool_use"; name: string };

function isToolUseBlock(b: unknown): b is ToolUseShape {
  if (typeof b !== "object" || b === null) return false;
  const rec = b as UnknownBlock;
  return rec.type === "tool_use" && typeof rec.name === "string";
}

function extractAction(input: unknown): "preview" | "plan" | "apply" | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const rec = input as Record<string, unknown> & { action?: unknown; dryRun?: unknown };
  const a = rec.action;
  if (a === "preview" || a === "plan" || a === "apply") return a as "preview" | "plan" | "apply";
  if (rec.dryRun === true) return "preview";
  return undefined;
}
