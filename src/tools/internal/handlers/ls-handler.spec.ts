import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lsHandler } from "./ls";

let ROOT: string;

beforeAll(() => {
  ROOT = mkdtempSync(join(tmpdir(), "ls-handler-"));
  mkdirSync(join(ROOT, "dir"));
  writeFileSync(join(ROOT, "a.txt"), "data");
  writeFileSync(join(ROOT, "dir", "b.log"), "log");
});

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {}
});

describe("lsHandler", () => {
  it("lists directory entries", () => {
    const out = lsHandler.execute("LS", { path: ROOT }, {});
    if (typeof out !== "object" || out === null || !("entries" in out))
      throw new Error("invalid output");
    const entries = (out as { entries: Array<{ name: string; type: string }> })
      .entries;
    expect(entries.some((e) => e.name === "a.txt")).toBe(true);
  });
  it("applies ignore patterns", () => {
    const out = lsHandler.execute("LS", { path: ROOT, ignore: ["a.*"] }, {});
    if (typeof out !== "object" || out === null || !("entries" in out))
      throw new Error("invalid output");
    const entries = (out as { entries: Array<{ name: string; type: string }> })
      .entries;
    expect(entries.some((e) => e.name === "a.txt")).toBe(false);
  });
  it("rejects relative path", () => {
    const out = lsHandler.execute("LS", { path: "./relative" }, {});
    if (typeof out !== "object" || out === null || !("error" in out))
      throw new Error("expected error");
    expect((out as { error: string }).error).toBe("absolute path required");
  });
});
