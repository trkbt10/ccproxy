import type { InternalToolHandler } from "../registry";

export const exitPlanModeHandler: InternalToolHandler = {
  name: "exit_plan_mode",
  canHandle: (toolName) => toolName === "exit_plan_mode",
  execute() {
    return { status: "ok", exited: true };
  },
};
