import type { RoutingConfig } from "../../config/types";
import { planToolExecution } from "../../execution/tool-model-planner";
import { createToolManager } from "./manager";
import type { ToolManager, ToolContext } from "./types";
import { logDebug, logError, logInfo } from "../../utils/logging/migrate-logger";

/**
 * Common tool item interfaces for both OpenAI and Claude formats
 */
export interface ToolUseItem {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultItem {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ProcessableItem = ToolUseItem | ToolResultItem | { type: string };

/**
 * Type guards for tool items
 */
function isToolUseItem(item: ProcessableItem): item is ToolUseItem {
  return (
    item.type === "tool_use" &&
    "id" in item &&
    "name" in item &&
    "input" in item &&
    typeof item.id === "string" &&
    typeof item.name === "string"
  );
}

function isToolResultItem(item: ProcessableItem): item is ToolResultItem {
  return (
    item.type === "tool_result" &&
    "tool_use_id" in item &&
    "content" in item &&
    typeof item.tool_use_id === "string" &&
    typeof item.content === "string"
  );
}

/**
 * Process tools in requests, executing internal tools when appropriate
 * Works with both OpenAI and Claude message formats
 */
export class ToolProcessor {
  private toolManager: ToolManager;
  
  constructor(
    private routingConfig: RoutingConfig,
    private requestId: string,
    private conversationId: string
  ) {
    // Create tool manager for this request
    this.toolManager = createToolManager({
      dtgStorage: routingConfig.dynamicTools?.storage,
      dtgStorageRoot: routingConfig.dynamicTools?.storageRoot,
    });
    
    // Load builtin tools
    this.toolManager.loadBuiltinTools();
  }
  
  /**
   * Process items and execute internal tools where needed
   * Generic implementation that works with any item format
   */
  async processItems<T extends ProcessableItem>(items: T[]): Promise<T[]> {
    const result: T[] = [];
    const pendingToolUses = new Map<string, ToolUseItem>();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (isToolUseItem(item)) {
        // Check if we should handle this tool internally
        const steps = planToolExecution(this.routingConfig, item.name, item.input);
        const internalStep = steps.find(s => s.kind === "internal");
        
        if (internalStep) {
          // Store pending tool use
          pendingToolUses.set(item.id, item);
          result.push(item);
          
          // Look ahead for existing tool_result
          const hasResult = items.slice(i + 1).some(
            next => isToolResultItem(next) && next.tool_use_id === item.id
          );
          
          if (!hasResult) {
            // Execute internal tool
            const toolResult = await this.executeInternalTool(
              internalStep.handler,
              item.name,
              item.input
            );
            
            // Add tool result
            const resultItem: ToolResultItem = {
              type: "tool_result",
              tool_use_id: item.id,
              content: typeof toolResult === "string" 
                ? toolResult 
                : JSON.stringify(toolResult),
            };
            
            result.push(resultItem as T);
            pendingToolUses.delete(item.id);
          }
        } else {
          // Not an internal tool, pass through
          result.push(item);
        }
      } else if (isToolResultItem(item)) {
        // Remove from pending if we see a result
        pendingToolUses.delete(item.tool_use_id);
        result.push(item);
      } else {
        // Other item types pass through unchanged
        result.push(item);
      }
    }
    
    // Execute any remaining pending internal tools
    for (const [toolUseId, toolUse] of pendingToolUses) {
      const steps = planToolExecution(this.routingConfig, toolUse.name, toolUse.input);
      const internalStep = steps.find(s => s.kind === "internal");
      
      if (internalStep) {
        const toolResult = await this.executeInternalTool(
          internalStep.handler,
          toolUse.name,
          toolUse.input
        );
        
        const resultItem: ToolResultItem = {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: typeof toolResult === "string" 
            ? toolResult 
            : JSON.stringify(toolResult),
        };
        
        result.push(resultItem as T);
      }
    }
    
    return result;
  }
  
  /**
   * Execute an internal tool using unified manager
   */
  private async executeInternalTool(
    handlerName: string,
    toolName: string,
    input: unknown
  ): Promise<unknown> {
    const context: ToolContext = {
      conversationId: this.conversationId,
      requestId: this.requestId,
    };
    
    logDebug("Executing internal tool", { 
      handlerName, 
      toolName, 
      input 
    }, context);
    
    try {
      // Use unified tool manager
      if (this.toolManager.registry.has(toolName)) {
        const result = await this.toolManager.execute(toolName, input, context);
        logInfo("Internal tool executed", { handlerName, toolName }, context);
        return result;
      }
      
      // Try with handler name if different from tool name
      if (handlerName !== toolName && this.toolManager.registry.has(handlerName)) {
        const result = await this.toolManager.execute(handlerName, input, context);
        logInfo("Internal tool executed via handler name", { handlerName, toolName }, context);
        return result;
      }
      
      throw new Error(`No tool found: ${toolName} (handler: ${handlerName})`);
    } catch (error) {
      logError("Failed to execute internal tool", error, {
        handlerName,
        toolName,
        requestId: this.requestId,
      });
      
      // Return error as tool result
      return {
        error: true,
        message: `Failed to execute tool ${toolName}: ${error}`,
      };
    }
  }
}

/**
 * Create a tool processor for a request
 */
export function createToolProcessor(
  routingConfig: RoutingConfig,
  requestId: string,
  conversationId: string
): ToolProcessor {
  return new ToolProcessor(routingConfig, requestId, conversationId);
}