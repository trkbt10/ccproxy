import type { ToolRuntime } from "../../../../../tools/runtime/types";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

interface LSInput {
  path: string;
  ignore?: string[];
}

function isLSInput(v: unknown): v is LSInput {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  if (typeof o.path !== "string") {
    return false;
  }
  if (o.ignore && !Array.isArray(o.ignore)) {
    return false;
  }
  return true;
}

export const lsTool: ToolRuntime = {
  name: "LS",
  description: "List files and directories in a given path",
  execute: async (input: unknown) => {
    if (!isLSInput(input)) {
      return { error: "invalid_input" };
    }
    const { path, ignore } = input;
    if (!path.startsWith("/")) {
      return { error: "absolute path required" };
    }
    const target = resolve(path);
    let entries = readdirSync(target, { withFileTypes: true }).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
    }));
    if (ignore && ignore.length) {
      const patterns = ignore.map(
        (s) =>
          new RegExp(s.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*"))
      );
      entries = entries.filter((e) => !patterns.some((r) => r.test(e.name)));
    }
    return { entries };
  },
  validateInput: isLSInput,
  metadata: {
    version: "1.0.0",
    tags: ["filesystem", "directory"],
    source: "builtin",
  },
};