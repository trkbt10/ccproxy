import type { ToolRuntime, ToolContext } from "../types";
import type { DynamicToolRuntime, DynamicToolContext } from "../../dynamic-tool-generation/types";

/**
 * Adapt Dynamic Tool Generation runtime to Tool Runtime interface
 */
export function adaptGeneratedToRuntime(dtgRuntime: DynamicToolRuntime): ToolRuntime {
  return {
    name: dtgRuntime.name,
    description: dtgRuntime.description || "Dynamically generated tool",
    execute: async (input: unknown, context: ToolContext) => {
      // Convert context to DTG format
      const dtgContext: DynamicToolContext = {
        conversationId: context.conversationId,
        requestId: context.requestId,
      };

      // Execute and return result
      return dtgRuntime.execute(input, dtgContext);
    },
    metadata: {
      source: "dynamic",
      sourceDetails: {
        original: "DynamicToolRuntime",
        generatedAt: new Date(),
      },
    },
  };
}