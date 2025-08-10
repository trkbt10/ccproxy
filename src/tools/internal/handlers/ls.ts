import type { InternalToolHandler } from "../registry";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

interface LSInput {
  path: string;
  ignore?: string[];
}
function isLSInput(v: unknown): v is LSInput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.path !== "string") return false;
  if (o.ignore && !Array.isArray(o.ignore)) return false;
  return true;
}

export const lsHandler: InternalToolHandler = {
  name: "LS",
  canHandle: (toolName) => toolName === "LS",
  execute(_toolName, input) {
    if (!isLSInput(input)) return { error: "invalid_input" };
    const { path, ignore } = input;
    if (!path.startsWith("/")) return { error: "absolute path required" };
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
};
