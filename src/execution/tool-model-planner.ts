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
  preferModel?: string;
};

export type Step = InternalStep | ResponsesModelStep;

export type ToolRule = {
  name: string;
  enabled?: boolean;
  steps: Step[];
};

export type OpenAIClientConfig = {
  // Extra headers to send to OpenAI
  defaultHeaders?: Record<string, string>;
  // Header name that carries an API key identifier (e.g., "x-openai-key-id")
  apiKeyHeader?: string;
  // Map from key-id to environment variable name that stores the actual key
  apiKeys?: Record<string, string>;
  // Map from model prefix to environment variable name for the API key
  apiKeyByModelPrefix?: Record<string, string>;
};

export type RoutingConfig = {
  defaultModel: string;
  overrideHeader?: string;
  tools?: ToolRule[];
  // Optional OpenAI client configuration and API key routing
  openai?: OpenAIClientConfig;
};

// Select the OpenAI model for the current request
export function selectModelForRequest(
  cfg: RoutingConfig,
  req: ClaudeMessageCreateParams,
  getHeader: (name: string) => string | null
): string {
  const override = getHeader(cfg.overrideHeader || "x-openai-model");
  if (override && override.trim()) return override.trim();

  const toolNames = extractToolNames(req);
  for (const name of toolNames) {
    const steps = planToolExecution(cfg, name, undefined);
    for (const s of steps) {
      if (s.kind === "responses_model" && s.preferModel) {
        return s.preferModel;
      }
    }
  }
  return cfg.defaultModel;
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
