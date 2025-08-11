import { echoHandler } from "./echo";
import type { InternalToolHandler } from "../registry";

function run<TInput, TOut>(
  h: InternalToolHandler,
  name: string,
  input: TInput
): unknown {
  return h.execute(name, input, {});
}

describe("echoHandler", () => {
  it("echoes string", () => {
    const out = run(echoHandler, "echo", "hello");
    expect(out).toBe("hello");
  });
  it("stringifies object", () => {
    const out = run(echoHandler, "echo", { a: 1 });
    expect(typeof out).toBe("string");
    expect(out as string).toContain('"a":1');
  });
});
