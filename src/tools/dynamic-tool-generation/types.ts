// Core types for dynamic tool generation and execution

export type DynamicToolContext = {
  conversationId?: string;
  requestId?: string;
};

export type DynamicToolExecuteFn = (input: unknown, context: DynamicToolContext) => Promise<unknown> | unknown;

export type DynamicToolRuntime = {
  // Unique tool name (used for lookup and invocation)
  name: string;
  // Optional short description for humans
  description?: string;
  // Execution entry point
  execute: DynamicToolExecuteFn;
};

// LLM generation request (high-level)
export type GenerationRequest = {
  // Human instruction describing the tool to build
  instruction: string;
  // Optional JSON schema for input validation (as plain object)
  inputSchema?: Record<string, unknown>;
  // Optional JSON schema for output
  outputSchema?: Record<string, unknown>;
  // Suggested tool name; the LLM may refine it but must preserve intent
  suggestedName?: string;
};

// LLM generation result in a strict file map format
export type GenerationArtifact = {
  path: string; // relative under a generated tool root
  content: string; // file content
};

export type GenerationPlan = {
  tool: ToolMeta;
  files: GenerationArtifact[];
  testFiles?: GenerationArtifact[];
};

// Namespacing key to isolate tools by purpose/schema
export type ToolKey = {
  functionName: string;
  schemaHash?: string;
  variant?: string;
};

export type ToolMeta = {
  name: string;
  description?: string;
  entry: string;
  exportName: string;
};

// Abstract storage provider
export type ToolStorage = {
  save(plan: GenerationPlan, key: ToolKey, namespace: string[]): Promise<ToolRef>;
  readFile(ref: ToolRef, relPath: string): Promise<string>;
  getMeta(ref: ToolRef): Promise<ToolMeta | undefined>;
};

export type ToolRef = {
  storage: ToolStorage;
  key: ToolKey;
  namespace: string[];
};

// Strongly-typed scenario binding to constrain request IO and folder layout
export type ToolScenario<I = unknown, O = unknown> = {
  scenarioId: string; // logical name
  namespace: [string, ...string[]]; // folder segments, at least one
  key: ToolKey; // functionName + schemaHash (+ variant)
  request: GenerationRequest; // instruction + schemas + suggestedName
  sampleInput: I; // for demo/testing
};

export type RuntimeExec = (input: unknown, context: DynamicToolContext) => Promise<unknown> | unknown;

export function makeToolId(namespace: string[], key: ToolKey): string {
  const ns = namespace.join("/").toLowerCase();
  const fn = key.functionName.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  const sh = (key.schemaHash || "nosha").replace(/[^a-f0-9]+/gi, "").slice(0, 16).toLowerCase();
  const v = (key.variant || "default").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  return `${ns}/${fn}__${sh}__${v}`;
}

// Adapter for OpenAI-compatible client calls (kept narrow for testability)
// Narrowed response type guard helpers
export type OpenAIResponseCandidate = {
  // OpenAI responses API shape (simplified): output_text or output array with message
  output_text?: string[];
  output?: Array<
    | { type: string; content?: string }
    | { type: "message"; role?: string; content?: Array<{ type: string; text?: string }> }
  >;
};

export function isOpenAIResponseCandidate(v: unknown): v is OpenAIResponseCandidate {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.output_text)) return true;
  if (Array.isArray(o.output)) return true;
  return false;
}
