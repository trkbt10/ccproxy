export type WhenClause = {
  actionIn?: ("preview" | "plan" | "apply")[];
};

export type InternalStep = {
  kind: "internal";
  handler: string;
  when?: WhenClause;
  stopOn?: "handled" | "always" | "never";
};

export type DynamicToolStep = {
  kind: "dynamic";
  when?: WhenClause;
  stopOn?: "handled" | "always" | "never";
};

export type ResponsesModelStep = {
  kind: "responses_model";
  providerId?: string;
  model?: string;
};

export type Step = InternalStep | ResponsesModelStep | DynamicToolStep;

// Tool routing strategy
export type ToolStrategy = 
  | "builtin-only"      // Use only provider-specific builtin tools
  | "dynamic-only"      // Use only dynamically generated tools  
  | "builtin-first"     // Try builtin first, fallback to dynamic
  | "dynamic-first"     // Try dynamic first, fallback to builtin
  | "passthrough";      // Don't intercept, let LLM handle it

// Tool configuration for providers
export type ToolConfig = {
  // Default routing strategy for all tools
  defaultStrategy?: ToolStrategy;
  // Tool-specific routing overrides
  routing?: Record<string, ToolStrategy>;
  // Tools to always enable/disable
  enabled?: string[];
  disabled?: string[];
};

export type ToolRule = {
  name: string;
  enabled?: boolean;
  steps: Step[];
};

export type ModelMapping = {
  byGrade?: Partial<{
    [grade in "high" | "mid" | "low"]: string;
  }>;
  aliases?: Record<string, string>;
};

export type Provider = {
  type: "openai" | "claude" | "gemini" | "grok" | "groq" | (string & {});
  model?: string; // Default model for this provider
  modelMapping?: ModelMapping; // Provider-specific model mapping
  baseURL?: string;
  apiKey?: string;
  api?: {
    keys?: Record<string, string>;
    keyHeader?: string;
    keyByModelPrefix?: Record<string, string>;
  };
  defaultHeaders?: Record<string, string>;
  instruction?: InstructionConfig;
  tools?: ToolConfig; // Provider-specific tool configuration
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
  defaults?: {
    providerId?: string;
    model?: string;
  };
  logging?: {
    dir?: string;
    enabled?: boolean;
    debugEnabled?: boolean;
    eventsEnabled?: boolean;
  };
  providers?: Record<string, Provider>;
  tools?: ToolRule[];
  instruction?: InstructionConfig;
  // Dynamic tool generation settings
  dynamicTools?: {
    storage?: "memory" | "filesystem"; // Default storage type
    storageRoot?: string; // Root directory for filesystem storage
    provider?: string; // Provider to use for tool generation
    model?: string; // Model to use for tool generation
  };
};
