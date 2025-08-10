import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import fs from "node:fs";
import path from "node:path";

// V2 routing model: Each tool has an ordered list of steps to try.
// The first matching step wins; internal can be declined and fall through.

export type WhenClause = {
  actionIn?: ("preview" | "plan" | "apply")[];
};

export type InternalStep = {
  kind: "internal";
  handler: string; // Name of InternalToolHandler to invoke
  when?: WhenClause;
  stopOn?: "handled" | "always" | "never";
};

export type ResponsesModelStep = {
  kind: "responses_model";
  preferModel?: string; // Hint for request-level model selection
};

export type Step = InternalStep | ResponsesModelStep; // Extendable later

export type ToolRule = {
  name: string;
  enabled?: boolean;
  steps: Step[];
};

export type RoutingConfig = {
  defaultModel: string;
  overrideHeader?: string; // e.g. "x-openai-model"
  tools?: ToolRule[];
};

let cachedConfig: RoutingConfig | null = null;

export function loadConfig(): RoutingConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = process.env.ROUTING_CONFIG_PATH || path.join(process.cwd(), "config", "routing.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const json = JSON.parse(raw) as RoutingConfig;
    cachedConfig = json;
    return json;
  } catch {
    const fallback: RoutingConfig = {
      defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      overrideHeader: "x-openai-model",
      tools: [],
    };
    cachedConfig = fallback;
    return fallback;
  }
}

// Pick request-level model based on header override, then first responses_model.preferModel encountered
export function pickRequestModel(
  req: ClaudeMessageCreateParams,
  getHeader: (name: string) => string | null
): string {
  const cfg = loadConfig();
  const override = getHeader(cfg.overrideHeader || "x-openai-model");
  if (override && override.trim()) return override.trim();

  const toolNames = extractToolNames(req);
  for (const name of toolNames) {
    const steps = getExecutionPlan(name, undefined); // when filtering applied per step
    for (const s of steps) {
      if (s.kind === "responses_model" && s.preferModel) {
        return s.preferModel;
      }
    }
  }
  return cfg.defaultModel;
}

// Return the ordered list of steps for a tool, filtering out steps whose when-clause doesn't match the input
export function getExecutionPlan(toolName: string, input: unknown): Step[] {
  const cfg = loadConfig();
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

// Helpers --------------------------------------------------------------------

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
  if (a === "preview" || a === "plan" || a === "apply") return a as any;
  if (rec.dryRun === true) return "preview";
  return undefined;
}
