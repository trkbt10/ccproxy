import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grepHandler } from "./grep";
import type { InternalToolHandler } from "../registry";

function run(
  h: InternalToolHandler,
  name: string,
  input: unknown
): Promise<unknown> | unknown {
  return h.execute(name, input, {});
}

let ROOT: string;

beforeAll(() => {
  ROOT = mkdtempSync(join(tmpdir(), "grep-handler-"));
  mkdirSync(join(ROOT, "sub"));
  writeFileSync(join(ROOT, "a.txt"), "alpha\nBravo target\ncharlie\n");
  writeFileSync(join(ROOT, "sub", "b.txt"), "one\ntwo\nTarget line three\n");
  writeFileSync(join(ROOT, "c.md"), "markdown file\n");
});

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {}
});

describe("grepHandler", () => {
  it("lists files with matches (default mode)", async () => {
    const out = (await run(grepHandler, "Grep", {
      pattern: "target",
      path: ROOT,
      glob: "**/*.txt",
    })) as { files: string[] };
    expect(Array.isArray(out.files)).toBe(true);
    expect(out.files.length).toBeGreaterThan(0);
  });
  it("counts matches", async () => {
    const out = (await run(grepHandler, "Grep", {
      pattern: "target",
      path: ROOT,
      glob: "**/*.txt",
      output_mode: "count",
    })) as { count: number };
    expect(typeof out.count).toBe("number");
    expect(out.count).toBeGreaterThan(0);
  });
  it("returns match objects with context", async () => {
    const out = (await run(grepHandler, "Grep", {
      pattern: "target",
      path: ROOT,
      glob: "**/*.txt",
      output_mode: "matches",
      "-C": 1,
    })) as {
      matches: Array<{ file: string; line: number; context: string[] }>;
    };
    expect(out.matches.length).toBeGreaterThan(0);
    const m = out.matches[0];
    expect(typeof m.file).toBe("string");
    expect(typeof m.line).toBe("number");
    expect(Array.isArray(m.context)).toBe(true);
  });
  it("handles invalid regex", async () => {
    const out = (await run(grepHandler, "Grep", {
      pattern: "[",
      path: ROOT,
    })) as { error?: string };
    expect(out.error).toBe("invalid_pattern");
  });
  it("skips when empty pattern", async () => {
    const out = (await run(grepHandler, "Grep", {
      pattern: "",
      path: ROOT,
    })) as { matches?: any[]; files?: string[] };
    expect(out.files || out.matches || []).toEqual([]);
  });
});
