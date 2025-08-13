import type { ToolRuntime } from "../../../../../tools/runtime/types";

export const exitPlanModeTool: ToolRuntime = {
  name: "exit_plan_mode",
  description: "Exit planning mode and proceed with execution",
  execute: async () => {
    return { status: "ok", exited: true };
  },
  validateInput: () => true, // No input validation needed
  metadata: {
    version: "1.0.0",
    tags: ["control", "planning"],
    source: "builtin",
  },
};