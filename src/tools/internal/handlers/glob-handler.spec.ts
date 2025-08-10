import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globHandler } from "./glob";
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
  ROOT = mkdtempSync(join(tmpdir(), "glob-handler-"));
  mkdirSync(join(ROOT, "sub"));
  writeFileSync(join(ROOT, "a.txt"), "one\n");
  writeFileSync(join(ROOT, "sub", "b.txt"), "two\n");
  writeFileSync(join(ROOT, "c.md"), "three\n");
});

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {}
});

describe("globHandler", () => {
  it("matches txt files recursively", async () => {
    const out = (await run(globHandler, "Glob", {
      pattern: "**/*.txt",
      path: ROOT,
    })) as { files: string[]; count: number };
    expect(out.files.sort()).toEqual(["a.txt", "sub/b.txt"].sort());
    expect(out.count).toBe(2);
  });
  it("returns empty on blank pattern", async () => {
    const out = (await run(globHandler, "Glob", {
      pattern: "   ",
      path: ROOT,
    })) as { files: string[] };
    expect(out.files).toEqual([]);
  });
  it("rejects invalid input type", async () => {
    const out = (await run(globHandler, "Glob", {})) as { error?: string };
    expect(out.error).toBe("invalid_input");
  });
});
