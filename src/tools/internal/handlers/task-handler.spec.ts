import { taskHandler } from "./task";

describe("taskHandler", () => {
  it("plans steps with description", () => {
    const out = taskHandler.execute(
      "Task",
      { description: "do sth", prompt: "p" },
      {}
    );
    if (typeof out !== "object" || out === null)
      throw new Error("invalid output");
    const o = out as { planned: boolean; steps: string[]; echo: string };
    expect(o.planned).toBe(true);
    expect(Array.isArray(o.steps)).toBe(true);
    expect(o.steps.length).toBeGreaterThan(0);
  });
  it("uses fallback task when no description", () => {
    const out = taskHandler.execute("Task", {}, {});
    if (typeof out !== "object" || out === null)
      throw new Error("invalid output");
    const o = out as { steps: string[] };
    expect(o.steps[0]).toBe("task");
  });
});
