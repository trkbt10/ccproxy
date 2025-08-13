import type { RoutingConfig } from "../config/types";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import type { ResponseCreateParams, Tool } from "openai/resources/responses/responses";
import { planToolExecution } from "./tool-model-planner";

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function extractToolNamesFromChat(req: ChatCompletionCreateParams): string[] {
  const names: string[] = [];
  const choice = (req as { tool_choice?: unknown }).tool_choice as ChatCompletionCreateParams["tool_choice"] | undefined;
  if (choice && typeof choice === "object" && (choice as { type?: unknown }).type === "function") {
    const name = (choice as { function?: { name?: unknown } }).function?.name;
    if (typeof name === "string") names.push(name);
  }
  if (Array.isArray(req.tools)) {
    for (const t of req.tools) {
      if (t && typeof t === "object" && (t as { type?: unknown }).type === "function") {
        const fn = (t as { function?: { name?: unknown } }).function?.name;
        if (typeof fn === "string") names.push(fn);
      }
    }
  }
  return unique(names);
}

export function extractToolNamesFromResponses(req: ResponseCreateParams): string[] {
  const names: string[] = [];
  const toolChoice = (req as { tool_choice?: unknown }).tool_choice as ResponseCreateParams["tool_choice"] | undefined;
  if (toolChoice && typeof toolChoice === "object" && (toolChoice as { type?: unknown }).type === "function") {
    const name = (toolChoice as { name?: unknown }).name;
    if (typeof name === "string") names.push(name);
  }
  const tools = (req as { tools?: unknown }).tools as Tool[] | undefined;
  if (Array.isArray(tools)) {
    for (const t of tools) {
      if (t && typeof t === "object" && (t as { type?: unknown }).type === "function") {
        const name = (t as { name?: unknown }).name;
        if (typeof name === "string") names.push(name);
      }
    }
  }
  return unique(names);
}

export function selectProviderForOpenAI(
  cfg: RoutingConfig,
  opts: { model?: string | null | undefined; toolNames: string[] }
): { providerId: string; model: string } {
  const explicitModel = typeof opts.model === "string" ? opts.model : undefined;

  for (const name of opts.toolNames) {
    const steps = planToolExecution(cfg, name, undefined);
    for (const s of steps) {
      if (s.kind === "responses_model") {
        const providerId = s.providerId || cfg.defaults?.providerId || "default";
        const model = s.model || explicitModel || cfg.defaults?.model;
        if (!model) throw new Error("No model specified: provide request.model or defaults.model");
        return { providerId, model };
      }
    }
  }

  const providers = cfg.providers || {};
  const providerId = cfg.defaults?.providerId
    ? cfg.defaults.providerId
    : providers["default"]
    ? "default"
    : Object.keys(providers).length === 1
    ? Object.keys(providers)[0]
    : "default";
  const model = explicitModel || cfg.defaults?.model;
  if (!model) throw new Error("No model specified: provide request.model or defaults.model");
  return { providerId, model };
}

