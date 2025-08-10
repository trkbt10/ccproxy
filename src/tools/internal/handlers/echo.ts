import type { InternalToolHandler } from "../registry";

export const echoHandler: InternalToolHandler = {
  name: "echo",
  canHandle: (toolName) => toolName === "echo" || toolName === "noop",
  execute(_toolName, input) {
    return typeof input === "string" ? input : JSON.stringify(input);
  },
};
