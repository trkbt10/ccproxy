/**
 * Export all builtin tools
 */
export { echoTool } from "./echo";
export { globTool } from "./glob";
export { grepTool } from "./grep";
export { lsTool } from "./ls";
export { exitPlanModeTool } from "./exit-plan-mode";
export { taskTool } from "./task";

import type { ToolRuntime } from "../../../../../tools/runtime/types";
import { echoTool } from "./echo";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { lsTool } from "./ls";
import { exitPlanModeTool } from "./exit-plan-mode";
import { taskTool } from "./task";

/**
 * Get all builtin tools as an array
 */
export function getAllBuiltinTools(): ToolRuntime[] {
  return [
    echoTool,
    globTool,
    grepTool,
    lsTool,
    exitPlanModeTool,
    taskTool,
  ];
}

/**
 * Get a builtin tool by name
 */
export function getBuiltinTool(name: string): ToolRuntime | undefined {
  const tools = getAllBuiltinTools();
  return tools.find(tool => tool.name === name || (tool.metadata as any)?.aliases?.includes(name));
}