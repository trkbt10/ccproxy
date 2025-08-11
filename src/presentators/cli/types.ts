// CLI command options types

export interface ServeOptions {
  port?: string | number;
  api?: "claude" | "openai";
  config: string;  // Always resolved to a path
  configOverrides?: Array<{ key: string; value: string }>;
}

export interface ConfigOptions {
  config: string;  // Always resolved to a path
  expanded?: boolean;
  force?: boolean;
}