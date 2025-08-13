import type { ToolRegistry, ToolRuntime } from "./types";

/**
 * Default implementation of ToolRegistry
 */
export class DefaultToolRegistry implements ToolRegistry {
  private tools: Map<string, ToolRuntime>;

  constructor() {
    this.tools = new Map();
  }

  register(tool: ToolRuntime): void {
    if (!tool.name) {
      throw new Error("Tool must have a name");
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolRuntime | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolRuntime[] {
    return Array.from(this.tools.values());
  }

  findByTag(tag: string): ToolRuntime[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.metadata.tags?.includes(tag)
    );
  }

  findBySource(source: ToolRuntime["metadata"]["source"]): ToolRuntime[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.metadata.source === source
    );
  }

  clear(): void {
    this.tools.clear();
  }
}

/**
 * Create a new tool registry instance
 */
export function createToolRegistry(): ToolRegistry {
  return new DefaultToolRegistry();
}