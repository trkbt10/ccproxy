import { createToolManager } from "./manager";
import type { ToolManager, ToolContext } from "./types";
import { logDebug, logError, logInfo } from "../../utils/logging/migrate-logger";

/**
 * Tool execution event
 */
export interface ToolExecutionEvent {
  toolUseId: string;
  toolName: string;
  handlerName: string;
  input: unknown;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * Tool execution listener
 */
export interface ToolExecutionListener {
  onToolExecuted(result: ToolExecutionResult): Promise<void>;
}

/**
 * Tool selector function type
 */
export type ToolSelector = (toolName: string, input: unknown) => { intercept: boolean; handlerName?: string };

/**
 * Tool interceptor options
 */
export interface ToolInterceptorOptions {
  requestId: string;
  conversationId: string;
  toolManager?: ToolManager;
  toolSelector?: ToolSelector;
  loadBuiltinTools?: boolean;
}

/**
 * Tool interceptor that detects and executes tools
 * without modifying the original data flow
 */
export class ToolInterceptor {
  private toolManager: ToolManager;
  private executingTools = new Set<string>();
  private listeners: ToolExecutionListener[] = [];
  private toolSelector?: ToolSelector;
  
  constructor(private options: ToolInterceptorOptions) {
    // Use provided tool manager or create a new one
    this.toolManager = options.toolManager || createToolManager();
    
    // Use provided tool selector
    this.toolSelector = options.toolSelector;
    
    // Load builtin tools if requested (default: false for generic use)
    if (options.loadBuiltinTools) {
      this.toolManager.loadBuiltinTools();
    }
  }
  
  /**
   * Add a listener for tool execution results
   */
  addListener(listener: ToolExecutionListener): void {
    this.listeners.push(listener);
  }
  
  /**
   * Check if a tool should be intercepted
   */
  shouldIntercept(toolName: string, input: unknown): { intercept: boolean; handlerName?: string } {
    // Use custom selector if provided
    if (this.toolSelector) {
      return this.toolSelector(toolName, input);
    }
    
    // Default behavior: check if tool exists in registry
    if (this.toolManager.registry.has(toolName)) {
      return { intercept: true, handlerName: toolName };
    }
    
    return { intercept: false };
  }
  
  /**
   * Intercept a tool call and execute it if it's an internal tool
   * This method is non-blocking and executes asynchronously
   */
  interceptToolCall(event: ToolExecutionEvent): void {
    const { toolUseId, toolName, handlerName, input } = event;
    
    // Prevent duplicate execution
    if (this.executingTools.has(toolUseId)) {
      logDebug("Tool already executing, skipping", { toolUseId, toolName }, { requestId: this.options.requestId });
      return;
    }
    
    this.executingTools.add(toolUseId);
    
    // Execute asynchronously
    this.executeInternalTool(handlerName, toolName, input)
      .then(async (result) => {
        const executionResult: ToolExecutionResult = {
          toolUseId,
          content: typeof result === "string" ? result : JSON.stringify(result),
          isError: false,
        };
        
        // Notify listeners
        for (const listener of this.listeners) {
          await listener.onToolExecuted(executionResult);
        }
      })
      .catch(async (error) => {
        logError("Tool execution failed", error, {
          toolUseId,
          toolName,
          requestId: this.options.requestId,
        });
        
        const executionResult: ToolExecutionResult = {
          toolUseId,
          content: `Error executing tool ${toolName}: ${error}`,
          isError: true,
        };
        
        // Notify listeners
        for (const listener of this.listeners) {
          await listener.onToolExecuted(executionResult);
        }
      })
      .finally(() => {
        this.executingTools.delete(toolUseId);
      });
  }
  
  /**
   * Execute an internal tool
   */
  private async executeInternalTool(
    handlerName: string,
    toolName: string,
    input: unknown
  ): Promise<unknown> {
    const context: ToolContext = {
      conversationId: this.options.conversationId,
      requestId: this.options.requestId,
    };
    
    logDebug("Executing internal tool", { 
      handlerName, 
      toolName, 
      input 
    }, context);
    
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
  }
  
  /**
   * Check if a tool is currently executing
   */
  isExecuting(toolUseId: string): boolean {
    return this.executingTools.has(toolUseId);
  }
  
  /**
   * Get the number of currently executing tools
   */
  getExecutingCount(): number {
    return this.executingTools.size;
  }
}

/**
 * Create a tool interceptor
 */
export function createToolInterceptor(options: ToolInterceptorOptions): ToolInterceptor {
  return new ToolInterceptor(options);
}