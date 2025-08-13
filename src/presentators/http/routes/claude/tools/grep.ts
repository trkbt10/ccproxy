import type { ToolRuntime } from "../../../../../tools/runtime/types";
import {
  listAllFiles,
  matchGlob,
  readFileLimited,
  type ReadFileLimitedResult,
} from "./utils/fs-utils";
import { resolve } from "node:path";

interface GrepInput {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: string;
  ["-A"]?: number;
  ["-B"]?: number;
  ["-C"]?: number;
  head_limit?: number;
  multiline?: boolean;
}

interface FileMatch {
  file: string;
  line: number;
  text: string;
  context: string[];
}

function isGrepInput(v: unknown): v is GrepInput {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.pattern === "string" && obj.pattern.length > 0;
}

export const grepTool: ToolRuntime = {
  name: "Grep",
  description: "Search for patterns in files using regular expressions",
  execute: async (input: unknown) => {
    if (!isGrepInput(input)) {
      return { matches: [] };
    }
    
    const i = input;
    const root = resolve(i.path || process.cwd());
    let files = await listAllFiles(root);
    if (i.glob) files = matchGlob(files, root, i.glob);
    const flags = i.multiline ? "ms" : "m";
    let rx: RegExp;
    try {
      rx = new RegExp(i.pattern, flags);
    } catch {
      return { error: "invalid_pattern" };
    }
    const matches: FileMatch[] = [];
    const head = i.head_limit && i.head_limit > 0 ? i.head_limit : undefined;
    const mode = i.output_mode || "files_with_matches";
    const before = i["-B"] ?? 0;
    const after = i["-A"] ?? 0;
    const context = i["-C"] ?? 0;
    const contextBefore = context > 0 ? context : before;
    const contextAfter = context > 0 ? context : after;

    if (mode === "files_with_matches") {
      const filesWithMatches: string[] = [];
      for (const file of files) {
        if (head && filesWithMatches.length >= head) break;
        const r = await readFileLimited(file, { maxLineLength: 4096 });
        if (r.content && rx.test(r.content)) {
          filesWithMatches.push(file);
        }
      }
      return { files: filesWithMatches };
    } else if (mode === "count") {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const file of files) {
        if (head && total >= head) break;
        const r = await readFileLimited(file, { maxLineLength: 4096 });
        if (r.content) {
          const lines = r.content.split("\n");
          let count = 0;
          for (const line of lines) {
            if (rx.test(line)) count++;
          }
          if (count > 0) {
            counts[file] = count;
            total += count;
          }
        }
      }
      return { counts, total };
    } else {
      // content mode
      for (const file of files) {
        if (head && matches.length >= head) break;
        const r = await readFileLimited(file, { maxLineLength: 4096 });
        if (r.content) {
          const lines = r.content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (head && matches.length >= head) break;
            if (rx.test(lines[i])) {
              const ctx: string[] = [];
              for (let j = Math.max(0, i - contextBefore); j < i; j++) {
                ctx.push(lines[j]);
              }
              for (let j = i + 1; j <= Math.min(lines.length - 1, i + contextAfter); j++) {
                ctx.push(lines[j]);
              }
              matches.push({
                file,
                line: i + 1,
                text: lines[i],
                context: ctx,
              });
            }
          }
        }
      }
      return { matches };
    }
  },
  validateInput: isGrepInput,
  metadata: {
    version: "1.0.0",
    tags: ["filesystem", "search", "regex"],
    source: "builtin",
  },
};