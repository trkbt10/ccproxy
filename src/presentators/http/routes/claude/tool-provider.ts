/**
 * Claude Tool Provider
 * 
 * Provides Claude-specific tools and default configuration
 */

import type { Provider, ToolConfig } from "../../../../config/types";
import type { ToolProvider } from "../../common/tool-routing/types";
import { createToolProviderFromConfig } from "../../common/tool-routing/provider-factory";
import { getAllBuiltinTools } from "./tools";

/**
 * Claude-specific tool names
 */
export const CLAUDE_SPECIFIC_TOOLS = [
  "exit_plan_mode",
  "task",
  "echo",
  "glob",
  "grep",
  "ls",
] as const;

/**
 * Default tool configuration for Claude
 */
export const DEFAULT_CLAUDE_TOOL_CONFIG: ToolConfig = {
  defaultStrategy: "dynamic-first",
  routing: {
    // Claude-specific tools should use builtin only
    exit_plan_mode: "builtin-only",
    task: "builtin-only",
    // File system tools prefer builtin but can fallback to dynamic
    echo: "builtin-first",
    glob: "builtin-first",
    grep: "builtin-first",
    ls: "builtin-first",
  },
  enabled: [...CLAUDE_SPECIFIC_TOOLS],
};

/**
 * Create a Claude tool provider with configuration
 */
export function createClaudeToolProvider(providerConfig?: Provider): ToolProvider {
  // Merge default Claude tool config with provider config
  const mergedConfig: Provider = {
    ...providerConfig,
    type: "claude",
    tools: {
      ...DEFAULT_CLAUDE_TOOL_CONFIG,
      ...providerConfig?.tools,
      routing: {
        ...DEFAULT_CLAUDE_TOOL_CONFIG.routing,
        ...providerConfig?.tools?.routing,
      },
    },
  };
  
  return createToolProviderFromConfig(mergedConfig, getAllBuiltinTools());
}

