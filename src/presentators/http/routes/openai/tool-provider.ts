/**
 * OpenAI Tool Provider
 * 
 * Provides OpenAI-specific tools and default configuration
 */

import type { Provider, ToolConfig } from "../../../../config/types";
import type { ToolProvider } from "../../common/tool-routing/types";
import { createToolProviderFromConfig } from "../../common/tool-routing/provider-factory";

/**
 * Default tool configuration for OpenAI
 * Currently defaults to passthrough since OpenAI handles its own tools
 */
export const DEFAULT_OPENAI_TOOL_CONFIG: ToolConfig = {
  defaultStrategy: "passthrough",
  routing: {},
  enabled: [], // No builtin tools for OpenAI yet
};

/**
 * Create an OpenAI tool provider with configuration
 */
export function createOpenAIToolProvider(providerConfig?: Provider): ToolProvider {
  // Merge default OpenAI tool config with provider config
  const mergedConfig: Provider = {
    ...providerConfig,
    type: "openai",
    tools: {
      ...DEFAULT_OPENAI_TOOL_CONFIG,
      ...providerConfig?.tools,
      routing: {
        ...DEFAULT_OPENAI_TOOL_CONFIG.routing,
        ...providerConfig?.tools?.routing,
      },
    },
  };
  
  // No builtin tools for OpenAI yet
  return createToolProviderFromConfig(mergedConfig, []);
}


