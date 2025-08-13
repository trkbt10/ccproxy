import type { ToolRuntime } from "../../../../../tools/runtime/types";

interface TaskInput {
  description?: string;
  prompt?: string;
}

function isTaskInput(v: unknown): v is TaskInput {
  if (!v || typeof v !== "object") return true; // Allow empty object
  const obj = v as Record<string, unknown>;
  if (obj.description !== undefined && typeof obj.description !== "string") return false;
  if (obj.prompt !== undefined && typeof obj.prompt !== "string") return false;
  return true;
}

export const taskTool: ToolRuntime = {
  name: "Task",
  description: "Plan and execute a task",
  execute: async (input: unknown) => {
    const i = (input || {}) as TaskInput;
    return {
      planned: true,
      steps: [i.description || "task", "analyze", "act"],
      echo: i.prompt,
    };
  },
  validateInput: isTaskInput,
  metadata: {
    version: "1.0.0",
    tags: ["planning", "workflow"],
    source: "builtin",
  },
};