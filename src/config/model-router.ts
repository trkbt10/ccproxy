import type { MessageCreateParams as ClaudeMessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import fs from "node:fs";
import path from "node:path";

type ToolRule = {
  // Tool name to match (exact match)
  name: string;
  // Choose how to handle this tool
  execution?: "model" | "internal";
  // If execution === "model", prefer this model
  model?: string;
  // Optional: enable/disable rule quickly
  enabled?: boolean;
};

type RoutingConfig = {
  // Default model when no rule matches
  defaultModel: string;
  // Optional hard override via header name
  overrideHeader?: string; // e.g. "x-openai-model"
  // Tool-based routing rules
  tools?: ToolRule[];
};

let cachedConfig: RoutingConfig | null = null;

function loadConfig(): RoutingConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = process.env.ROUTING_CONFIG_PATH || path.join(process.cwd(), "config", "routing.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const json = JSON.parse(raw) as RoutingConfig;
    cachedConfig = json;
    return json;
  } catch (e) {
    // Fallback to sane defaults
    const fallback: RoutingConfig = {
      defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      overrideHeader: "x-openai-model",
      tools: [],
    };
    cachedConfig = fallback;
    return fallback;
  }
}

/**
 * Resolve the OpenAI model to use for this request.
 * Priority:
 * 1) Header override (e.g., x-openai-model)
 * 2) First matching tool rule with model specified
 * 3) defaultModel
 */
export function resolveModel(
  req: ClaudeMessageCreateParams,
  getHeader: (name: string) => string | null
): string {
  const cfg = loadConfig();
  const headerName = cfg.overrideHeader || "x-openai-model";
  const override = getHeader(headerName);
  if (override && override.trim().length > 0) return override.trim();

  // Inspect messages to find first matching tool rule with model
  const toolNames = extractToolNames(req);
  for (const name of toolNames) {
    const rule = cfg.tools?.find((r) => r.enabled !== false && r.name === name);
    if (rule?.model) return rule.model;
  }
  return cfg.defaultModel;
}

/**
 * Check if a given tool should be handled internally (code-based execution)
 */
export function shouldHandleInternally(toolName: string): boolean {
  const cfg = loadConfig();
  const rule = cfg.tools?.find((r) => r.enabled !== false && r.name === toolName);
  return rule?.execution === "internal";
}

/**
 * Extract tool names appearing as tool_use blocks in Claude messages.
 */
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
