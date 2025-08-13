/**
 * Tool Interceptor Factory
 * 
 * Generic factory for creating tool interceptors that can be used
 * by any API endpoint (Claude, OpenAI, Gemini, etc.)
 */

import type { RoutingConfig, Provider } from "../../../../config/types";
import { 
  createToolInterceptor, 
  type ToolInterceptor,
  type ToolSelector 
} from "../../../../tools/runtime/interceptor";
import { createToolManager } from "../../../../tools/runtime/manager";
import { planToolExecution } from "../../../../execution/tool-model-planner";
import type { 
  ToolRoutingMap,
  ToolProvider,
  ToolSource
} from "./types";
import { ToolRouter } from "./router";

export interface InterceptorOptions {
  // Basic configuration
  requestId: string;
  conversationId: string;
  routingConfig: RoutingConfig;
  
  // Tool configuration
  enableBuiltin?: boolean;
  enableDTG?: boolean;
  routing?: ToolRoutingMap;
  
  // Provider for endpoint-specific tools
  toolProvider: ToolProvider;
  
  // Optional provider configuration for creating provider
  providerConfig?: Provider;
}

/**
 * Create a generic tool interceptor with common logic
 */
export function createGenericToolInterceptor(
  options: InterceptorOptions
): ToolInterceptor {
  const {
    requestId,
    conversationId,
    routingConfig,
    toolProvider,
    enableBuiltin = true,
    enableDTG = true,
    routing = toolProvider.getDefaultRouting()
  } = options;
  
  // Create tool manager with DTG configuration
  const toolManager = createToolManager({
    dtgStorage: routingConfig.dynamicTools?.storage,
    dtgStorageRoot: routingConfig.dynamicTools?.storageRoot,
  });
  
  // Load endpoint-specific builtin tools if enabled
  if (enableBuiltin) {
    const builtinTools = toolProvider.getBuiltinTools();
    for (const tool of builtinTools) {
      toolManager.registry.register(tool);
    }
  }
  
  // Create tool router
  const toolRouter = new ToolRouter(routing);
  
  // Create tool selector with common logic
  const toolSelector: ToolSelector = (toolName: string, input: unknown) => {
    // First check legacy routing config
    const steps = planToolExecution(routingConfig, toolName, input);
    const internalStep = steps.find(s => s.kind === "internal");
    
    if (internalStep && internalStep.handler) {
      return { intercept: true, handlerName: internalStep.handler };
    }
    
    // Build available sources
    const availableSources: ToolSource[] = [];
    
    // Check builtin availability
    if (enableBuiltin && toolManager.registry.has(toolName)) {
      availableSources.push({
        type: "builtin",
        tool: toolManager.registry.get(toolName),
        available: true
      });
    }
    
    // Check DTG availability
    if (enableDTG) {
      availableSources.push({
        type: "dtg",
        tool: undefined,
        available: true
      });
    }
    
    // Select tool source using router
    const selectedSource = toolRouter.selectToolSource({
      toolName,
      input,
      conversationId,
      requestId,
      availableSources
    });
    
    if (!selectedSource || !selectedSource.tool) {
      return { intercept: false };
    }
    
    return {
      intercept: true,
      handlerName: `${selectedSource.type}:${toolName}`
    };
  };
  
  // Create interceptor
  return createToolInterceptor({
    requestId,
    conversationId,
    toolManager,
    toolSelector,
    loadBuiltinTools: false
  });
}

