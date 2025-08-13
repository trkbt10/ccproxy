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
  type: "openai" | "claude" | "gemini" | "grok" | "groq" | (string & {});
  model?: string; // Default model for this provider
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
  defaults?: {
    providerId?: string;
    model?: string;
  };
  // Optional mapping for cross-provider model selection
  modelMapping?: {
    byProviderType?: Record<
      Provider["type"],
      {
        byGrade?: Partial<{
          [grade in "high" | "mid" | "low"]: string;
        }>;
        aliases?: Record<string, string>;
      }
    >;
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
};
