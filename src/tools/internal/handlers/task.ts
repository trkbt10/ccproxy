import type { InternalToolHandler } from "../registry";

interface TaskInput {
  description?: string;
  prompt?: string;
}

export const taskHandler: InternalToolHandler = {
  name: "Task",
  canHandle: (toolName) => toolName === "Task",
  execute(_toolName, input) {
    const i = input as TaskInput;
    return {
      planned: true,
      steps: [i.description || "task", "analyze", "act"],
      echo: i.prompt,
    };
  },
};
