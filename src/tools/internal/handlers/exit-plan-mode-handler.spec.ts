import { exitPlanModeHandler } from "./exitPlanMode";

describe("exitPlanModeHandler", () => {
  it("exits plan mode", () => {
    const out = exitPlanModeHandler.execute("exit_plan_mode", {}, {});
    if (typeof out !== "object" || out === null)
      throw new Error("invalid output");
    expect((out as { exited: boolean }).exited).toBe(true);
  });
});
