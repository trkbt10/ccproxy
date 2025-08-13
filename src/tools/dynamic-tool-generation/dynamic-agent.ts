import type { Provider } from "../../config/types";
import { buildOpenAICompatibleClient } from "../../adapters/providers/openai-client";
import type { GenerationRequest, ToolKey, ToolRef, ToolStorage, ToolScenario } from "./types";
import type { OpenAICompatibleClient } from "../../adapters/providers/openai-client-types";
import { generateToolPlan } from "./agent/generator";
import { createFileSystemStorage } from "./storage/fs";
import { executeGeneratedTool } from "./runtime/executor";

export type AgentGenerateOptions = {
  provider: Provider;
  model: string;
  signal?: AbortSignal;
  storage?: ToolStorage;
};

export async function generateDynamicTool(
  req: GenerationRequest,
  opts: AgentGenerateOptions,
  key: ToolKey,
  namespace: [string, ...string[]]
): Promise<ToolRef> {
  const client: OpenAICompatibleClient = buildOpenAICompatibleClient(opts.provider, opts.model);
  const plan = await generateToolPlan(client, opts.model, req, { signal: opts.signal });
  const storage = opts.storage || createFileSystemStorage();
  const ref = await storage.save(plan, key, namespace);
  return ref;
}

export async function generateDynamicToolForScenario(
  scenario: ToolScenario,
  opts: AgentGenerateOptions
): Promise<ToolRef> {
  return generateDynamicTool(scenario.request, opts, scenario.key, scenario.namespace);
}

export async function runGeneratedTool(
  ref: ToolRef,
  input: unknown,
  context: { conversationId?: string; requestId?: string }
): Promise<unknown> {
  return executeGeneratedTool(ref, input, context);
}
