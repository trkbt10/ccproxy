import { loadRuntimeFromStorage } from "./loader";
import { createMemoryStorage } from "../storage/memory";

describe("dynamic runtime loader (memory)", () => {
  it("loads and executes a generated tool runtime", async () => {
    const storage = createMemoryStorage();
    const key = { functionName: "echo", schemaHash: "abc123" };
    const ref = await storage.save(
      {
        tool: { name: "sample_tool", description: "sample", entry: "handler.js", exportName: "dynamicTool" },
        files: [
          {
            path: "handler.js",
            content: `export const dynamicTool = { name: 'sample_tool', execute(input){ return { ok:true, echo: input }; } };`,
          },
        ],
      },
      key,
      ["spec"]
    );
    const rt = await loadRuntimeFromStorage(ref);
    expect(rt.name).toBe("sample_tool");
    const out = await rt.execute({ hello: "world" }, {});
    expect(out && typeof out === "object").toBe(true);
  });
});
