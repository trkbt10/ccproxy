import type { InternalToolHandler } from "../registry";
import { listAllFiles, matchGlob } from "./fsUtils";
import { resolve } from "node:path";

interface GlobInput {
  pattern: string;
  path?: string;
}
function isGlobInput(v: unknown): v is GlobInput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.pattern === "string" &&
    (o.path === undefined || typeof o.path === "string")
  );
}

export const globHandler: InternalToolHandler = {
  name: "Glob",
  canHandle: (toolName) => toolName === "Glob",
  async execute(_toolName, input) {
    if (!isGlobInput(input)) return { error: "invalid_input" };
    const { pattern, path } = input;
    if (!pattern.trim()) return { files: [] };
    const root = resolve(path || process.cwd());
    const files = await listAllFiles(root);
    const matched = matchGlob(files, root, pattern).sort();
    return { files: matched, count: matched.length };
  },
};
