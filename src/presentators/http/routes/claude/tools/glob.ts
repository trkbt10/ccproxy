import type { ToolRuntime } from "../../../../../tools/runtime/types";
import { listAllFiles, matchGlob } from "./utils/fs-utils";
import { resolve } from "node:path";

interface GlobInput {
  pattern: string;
  path?: string;
}

function isGlobInput(v: unknown): v is GlobInput {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    typeof o.pattern === "string" &&
    (o.path === undefined || typeof o.path === "string")
  );
}

export const globTool: ToolRuntime = {
  name: "Glob",
  description: "Search for files using glob patterns",
  execute: async (input: unknown) => {
    if (!isGlobInput(input)) {
      return { error: "invalid_input" };
    }
    const { pattern, path } = input;
    if (!pattern.trim()) {
      return { files: [] };
    }
    const root = resolve(path || process.cwd());
    const files = await listAllFiles(root);
    const matched = matchGlob(files, root, pattern).sort();
    return { files: matched, count: matched.length };
  },
  validateInput: isGlobInput,
  metadata: {
    version: "1.0.0",
    tags: ["filesystem", "search"],
    source: "builtin",
  },
};