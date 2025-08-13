/**
 * Tool Runtime System Types
 * 
 * Core interfaces for the tool runtime system that manages
 * builtin, dynamic, and external tools.
 */

export type ToolContext = {
  conversationId?: string;
  requestId?: string;
  [key: string]: unknown; // Allow extensions
};

export type ToolExecuteFn = (
  input: unknown,
  context: ToolContext
) => Promise<unknown>;

export type ToolRuntime = {
  // Unique tool name
  name: string;
  // Tool description (required for clarity)
  description: string;
  // Main execution function
  execute: ToolExecuteFn;
  // Optional input validation
  validateInput?: (input: unknown) => boolean;
  // Tool metadata including source information
  metadata: {
    source: "builtin" | "dynamic" | "external" | "custom";
    version?: string;
    author?: string;
    tags?: string[];
    [key: string]: unknown;
  };
};

export type ToolRegistry = {
  register(tool: ToolRuntime): void;
  unregister(name: string): boolean;
  get(name: string): ToolRuntime | undefined;
  has(name: string): boolean;
  list(): ToolRuntime[];
  findByTag(tag: string): ToolRuntime[];
  findBySource(source: ToolRuntime["metadata"]["source"]): ToolRuntime[];
  clear(): void;
};

export type ToolManager = {
  // Registry for this manager instance
  registry: ToolRegistry;
  
  // Execute a tool by name
  execute(
    toolName: string,
    input: unknown,
    context?: ToolContext
  ): Promise<unknown>;
  
  // Load tools from various sources
  loadFromModule(modulePath: string): Promise<void>;
  loadFromDirectory(dirPath: string): Promise<void>;
  loadBuiltinTools(): void;
  
  // Tool discovery helpers
  findTool(name: string): ToolRuntime | undefined;
  searchTools(query: {
    name?: string;
    tags?: string[];
    source?: ToolRuntime["metadata"]["source"];
  }): ToolRuntime[];
};

// Tool definition for configuration
export type ToolDefinition = {
  type: "builtin" | "module" | "directory" | "dynamic";
  // For builtin tools
  names?: string[]; // If omitted, load all
  // For module/directory tools  
  path?: string;
  // For dynamic tools
  key?: {
    name: string;
    namespace: string[];
  };
  // Common options
  options?: {
    lazy?: boolean;
    override?: boolean;
    [key: string]: unknown;
  };
};