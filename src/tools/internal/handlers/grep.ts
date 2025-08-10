import type { InternalToolHandler } from "../registry";
import {
  listAllFiles,
  matchGlob,
  readFileLimited,
  type ReadFileLimitedResult,
} from "./fsUtils";
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

export const grepHandler: InternalToolHandler = {
  name: "Grep",
  canHandle: (toolName) => toolName === "Grep",
  async execute(_toolName, input) {
    const i: GrepInput = input as GrepInput;
    if (!i || typeof i.pattern !== "string" || i.pattern.length === 0) {
      return { matches: [] };
    }
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
    const both = i["-C"];
    const contextBefore = both != null ? both : before;
    const contextAfter = both != null ? both : after;
    const filesWithMatches: string[] = [];
    let count = 0;
    for (const f of files) {
      if (head && count >= head) break;
      const rel = f.replace(root + "/", "");
      const r: ReadFileLimitedResult = await readFileLimited(f);
      if ("skipped" in r) continue;
      const content = r.content;
      if (mode === "files_with_matches") {
        if (rx.test(content)) {
          filesWithMatches.push(rel);
          count++;
        }
        continue;
      }
      const lines = content.split(/\n/);
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (!rx.test(line)) continue;
        if (mode === "count") {
          count++;
          if (head && count >= head) break;
          continue;
        }
        const start = Math.max(0, lineIdx - contextBefore);
        const end = Math.min(lines.length, lineIdx + contextAfter + 1);
        matches.push({
          file: rel,
          line: lineIdx + 1,
          text: line,
          context: lines.slice(start, end),
        });
        count++;
        if (head && count >= head) break;
      }
    }
    if (mode === "count") {
      return { count };
    }
    if (mode === "files_with_matches") {
      return { files: filesWithMatches };
    }
    return { matches };
  },
};
