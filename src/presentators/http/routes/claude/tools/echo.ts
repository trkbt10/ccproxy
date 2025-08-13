import type { ToolRuntime } from "../../../../../tools/runtime/types";

export const echoTool: ToolRuntime = {
  name: "echo",
  description: "Echo back the input (also handles 'noop')",
  execute: async (input: unknown) => {
    return typeof input === "string" ? input : JSON.stringify(input);
  },
  validateInput: () => true, // Accept any input
  metadata: {
    source: "builtin",
    aliases: ["noop"],
    version: "1.0.0",
  },
};