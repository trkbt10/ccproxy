import { createToolManager } from "./manager";
import type { ToolContext, ToolDefinition } from "./types";

/**
 * Example: Creating a tool manager instance for a specific request/session
 */
async function handleToolRequest() {
  // Create a tool manager for this request
  const toolManager = createToolManager({
    dtgStorage: "memory", // Use memory storage for this session
  });

  // Load builtin tools
  toolManager.loadBuiltinTools();

  // Execute echo tool
  const echoResult = await toolManager.execute("echo", "Hello, World!");
  console.log("Echo result:", echoResult); // "Hello, World!"

  // Execute glob tool with context
  const context: ToolContext = {
    conversationId: "conv-123",
    requestId: "req-456",
  };

  const globResult = await toolManager.execute(
    "Glob",
    { pattern: "**/*.ts", path: "./src" },
    context
  );
  console.log("Glob result:", globResult);
}

/**
 * Example: Creating a tool manager from configuration
 */
async function createFromConfig() {
  const toolDefinitions: ToolDefinition[] = [
    { type: "builtin" },
    { type: "module", path: "./tools/validator.js" },
    { type: "dynamic", key: { name: "json-formatter", namespace: ["formatters"] } },
  ];

  const toolManager = createToolManager({
    dtgStorage: "filesystem",
    dtgStorageRoot: "./generated-tools",
  });

  // Load all defined tools
  for (const def of toolDefinitions) {
    if (def.type === "builtin") {
      toolManager.loadBuiltinTools();
    } else if (def.type === "module" && def.path) {
      await toolManager.loadFromModule(def.path);
    }
    // Dynamic tools would be loaded on-demand
  }

  return toolManager;
}

/**
 * Example: Using tool manager in a request handler
 */
export async function processToolCall(params: {
  toolName: string;
  input: unknown;
  sessionId: string;
  requestId: string;
}) {
  // Create or get tool manager for this session
  const toolManager = createToolManager();
  toolManager.loadBuiltinTools();

  const context: ToolContext = {
    conversationId: params.sessionId,
    requestId: params.requestId,
  };

  try {
    const result = await toolManager.execute(
      params.toolName,
      params.input,
      context
    );
    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}