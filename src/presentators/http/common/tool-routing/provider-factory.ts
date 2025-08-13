/**
 * Tool Provider Factory
 * 
 * Creates tool providers based on configuration
 */

import type { Provider, ToolStrategy } from "../../../../config/types";
import type { ToolProvider, ToolRoutingMap, ToolSourceStrategy } from "./types";
import type { ToolRuntime } from "../../../../tools/runtime/types";

/**
 * Map configuration ToolStrategy to internal ToolSourceStrategy
 */
function mapStrategy(strategy: ToolStrategy): ToolSourceStrategy {
  switch (strategy) {
    case "builtin-only":
      return "builtin-only";
    case "dynamic-only":
      return "dtg-only";
    case "builtin-first":
      return "builtin-first";
    case "dynamic-first":
      return "dtg-first";
    case "passthrough":
      return "llm-passthrough";
    default:
      return "llm-passthrough";
  }
}

/**
 * Configuration-based tool provider
 */
export class ConfigurableToolProvider implements ToolProvider {
  private builtinTools: Map<string, ToolRuntime> = new Map();
  private routingMap: ToolRoutingMap;
  private endpointSpecificTools: Set<string>;

  constructor(
    private providerConfig: Provider,
    builtinTools: ToolRuntime[] = []
  ) {
    // Initialize builtin tools
    for (const tool of builtinTools) {
      this.builtinTools.set(tool.name, tool);
    }
    
    // Build routing map from configuration
    this.routingMap = this.buildRoutingMap();
    
    // Track endpoint-specific tools
    this.endpointSpecificTools = new Set(
      providerConfig.tools?.enabled || []
    );
  }

  getBuiltinTools(): ToolRuntime[] {
    const enabledTools = this.providerConfig.tools?.enabled || [];
    const disabledTools = this.providerConfig.tools?.disabled || [];
    
    return Array.from(this.builtinTools.values()).filter(tool => {
      // If enabled list exists, only include tools in that list
      if (enabledTools.length > 0) {
        return enabledTools.includes(tool.name);
      }
      // Otherwise, include all tools except disabled ones
      return !disabledTools.includes(tool.name);
    });
  }

  getDefaultRouting(): ToolRoutingMap {
    return this.routingMap;
  }

  isEndpointSpecific(toolName: string): boolean {
    return this.endpointSpecificTools.has(toolName);
  }

  private buildRoutingMap(): ToolRoutingMap {
    const toolConfig = this.providerConfig.tools;
    const defaultStrategy = toolConfig?.defaultStrategy || "passthrough";
    
    // Start with default strategy for all tools
    const routingMap: ToolRoutingMap = {
      "*": mapStrategy(defaultStrategy)
    };
    
    // Apply tool-specific overrides
    if (toolConfig?.routing) {
      for (const [toolName, strategy] of Object.entries(toolConfig.routing)) {
        routingMap[toolName] = mapStrategy(strategy);
      }
    }
    
    return routingMap;
  }
}

/**
 * Create a tool provider from configuration
 */
export function createToolProviderFromConfig(
  providerConfig: Provider,
  builtinTools: ToolRuntime[] = []
): ToolProvider {
  return new ConfigurableToolProvider(providerConfig, builtinTools);
}