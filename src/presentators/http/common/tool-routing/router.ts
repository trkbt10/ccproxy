/**
 * Common Tool Router
 * 
 * Generic tool router that can be used by any API endpoint
 */

import type { 
  ToolSourceStrategy, 
  ToolSource, 
  ToolSelectionContext, 
  ToolRoutingMap 
} from "./types";

/**
 * Generic tool router for selecting the appropriate tool source
 */
export class ToolRouter {
  constructor(
    private routingConfig: ToolRoutingMap,
    private defaultStrategy: ToolSourceStrategy = "llm-passthrough"
  ) {}

  /**
   * Select the appropriate tool source based on configuration
   */
  selectToolSource(context: ToolSelectionContext): ToolSource | null {
    const strategy = this.routingConfig[context.toolName] || 
                    this.routingConfig["*"] || 
                    this.defaultStrategy;

    switch (strategy) {
      case "builtin-only":
        return this.findSource(context, "builtin");

      case "dtg-only":
        return this.findSource(context, "dtg");

      case "builtin-first": {
        const builtin = this.findSource(context, "builtin");
        return builtin || this.findSource(context, "dtg");
      }

      case "dtg-first": {
        const dtg = this.findSource(context, "dtg");
        return dtg || this.findSource(context, "builtin");
      }

      case "llm-passthrough":
        return null; // Don't intercept

      case "custom":
        // Custom logic would be implemented by extending this class
        return null;

      default:
        return null;
    }
  }

  /**
   * Update routing configuration
   */
  updateRouting(toolName: string, strategy: ToolSourceStrategy): void {
    this.routingConfig[toolName] = strategy;
  }

  /**
   * Get current routing configuration
   */
  getRouting(): ToolRoutingMap {
    return { ...this.routingConfig };
  }

  /**
   * Find a specific source type in available sources
   */
  protected findSource(
    context: ToolSelectionContext, 
    type: "builtin" | "dtg"
  ): ToolSource | null {
    return context.availableSources.find(
      source => source.type === type && source.available
    ) || null;
  }
}