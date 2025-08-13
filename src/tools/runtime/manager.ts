import type { ToolManager, ToolContext, ToolRuntime, ToolDefinition } from "./types";
import { createToolRegistry } from "./registry";
// DTG imports commented out until properly integrated
// import { loadTool } from "../dynamic-tool-generation/loader";
// import { MemoryStorage } from "../dynamic-tool-generation/storages/memory-storage";
// import { FileSystemStorage } from "../dynamic-tool-generation/storages/filesystem-storage";
// import { adaptGeneratedToRuntime } from "./adapters/generation-to-runtime";
// import type { ToolStorage, ToolKey } from "../dynamic-tool-generation/types";

// Builtin tools are now Claude-specific and should be loaded via presentators layer

/**
 * Default implementation of ToolManager
 */
export class DefaultToolManager implements ToolManager {
  registry = createToolRegistry();
  // private dtgStorage: ToolStorage;

  constructor(options?: {
    dtgStorage?: "memory" | "filesystem";
    dtgStorageRoot?: string;
  }) {
    // DTG storage will be initialized when properly integrated
    // this.dtgStorage = options?.dtgStorage === "filesystem"
    //   ? new FileSystemStorage({ rootDir: options.dtgStorageRoot || "./generated-tools" })
    //   : new MemoryStorage();
  }

  async execute(
    toolName: string,
    input: unknown,
    context?: ToolContext
  ): Promise<unknown> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    // Validate input if validator is available
    if (tool.validateInput && !tool.validateInput(input)) {
      throw new Error(`Invalid input for tool '${toolName}'`);
    }

    // Execute with default context if not provided
    const execContext = context || {};
    return tool.execute(input, execContext);
  }

  async loadFromModule(modulePath: string): Promise<void> {
    try {
      const module = await import(modulePath);
      
      // Look for default export or named exports
      if (module.default && this.isToolRuntime(module.default)) {
        this.registry.register(module.default);
      }
      
      // Check named exports
      for (const [key, value] of Object.entries(module)) {
        if (key !== "default" && this.isToolRuntime(value)) {
          this.registry.register(value as ToolRuntime);
        }
      }
    } catch (error) {
      throw new Error(`Failed to load module '${modulePath}': ${error}`);
    }
  }

  async loadFromDirectory(dirPath: string): Promise<void> {
    // Implementation would scan directory for tool modules
    throw new Error("Directory loading not implemented yet");
  }

  loadBuiltinTools(): void {
    // Builtin tools are now Claude-specific and should be loaded via presentators layer
    throw new Error("Builtin tools should be loaded through Claude-specific factory");
  }

  /**
   * Load a dynamic tool from DTG storage
   */
  async loadDynamicTool(key: any, namespace: string[]): Promise<void> {
    // DTG loading will be implemented when properly integrated
    throw new Error("Dynamic tool loading not yet implemented");
  }

  /**
   * Create a tool manager from configuration
   */
  static fromConfig(definitions: ToolDefinition[], options?: {
    dtgStorage?: "memory" | "filesystem";
    dtgStorageRoot?: string;
  }): ToolManager {
    const manager = new DefaultToolManager(options);
    
    // Load builtin tools if specified
    if (definitions.some(d => d.type === "builtin")) {
      manager.loadBuiltinTools();
    }
    
    // Load other tool types
    for (const def of definitions) {
      if (def.type === "module" && def.path) {
        // Queue module loading
        manager.loadFromModule(def.path).catch(err => {
          console.error(`Failed to load module '${def.path}':`, err);
        });
      }
    }
    
    return manager;
  }

  findTool(name: string): ToolRuntime | undefined {
    return this.registry.get(name);
  }

  searchTools(query: {
    name?: string;
    tags?: string[];
    source?: ToolRuntime["metadata"]["source"];
  }): ToolRuntime[] {
    let results = this.registry.list();
    
    if (query.name) {
      results = results.filter(tool => 
        tool.name.toLowerCase().includes(query.name!.toLowerCase())
      );
    }
    
    if (query.tags?.length) {
      results = results.filter(tool =>
        query.tags!.some(tag => tool.metadata.tags?.includes(tag))
      );
    }
    
    if (query.source) {
      results = results.filter(tool => tool.metadata.source === query.source);
    }
    
    return results;
  }

  private isToolRuntime(value: unknown): value is ToolRuntime {
    if (!value || typeof value !== "object") return false;
    const obj = value as any;
    return (
      typeof obj.name === "string" &&
      typeof obj.execute === "function"
    );
  }
}

/**
 * Create a new tool manager instance
 */
export function createToolManager(options?: {
  dtgStorage?: "memory" | "filesystem";
  dtgStorageRoot?: string;
}): ToolManager {
  return new DefaultToolManager(options);
}