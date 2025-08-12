import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Context } from "hono";
import { clientDisconnectMiddleware } from "./client-disconnect";

// Extended Request type for Node-like additions used by middleware
interface RawRequest extends Request {
  on?(event: string, listener: () => void): void;
  complete?: boolean;
}

type Next = () => Promise<void>;

// Minimal context implementing only members used by middleware
interface MinimalContext {
  get<T = unknown>(key: string): T;
  set<T = unknown>(key: string, value: T): void;
  req: { raw: RawRequest };
}

function createMinimalContext(raw: RawRequest): MinimalContext {
  const store = new Map<string, unknown>();
  return {
    get: <T = unknown>(k: string) => store.get(k) as T,
    set: <T = unknown>(k: string, v: T) => {
      store.set(k, v);
    },
    req: { raw },
  };
}

describe("clientDisconnectMiddleware", () => {
  const originalLog = console.log;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logSpy = vi.fn();
    console.log = logSpy as unknown as typeof console.log;
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it("stores an AbortController on context", async () => {
    const raw: RawRequest = new Request("http://localhost/test");
    const c = createMinimalContext(raw);
    c.set("requestId", "abc");
    const next: Next = async () => {};

    await clientDisconnectMiddleware(c as unknown as Context, next);

    const ac = c.get<AbortController>("abortController");
    expect(ac).toBeInstanceOf(AbortController);
    expect(ac.signal.aborted).toBe(false);
  });

  it("aborts when close event fires before completion", async () => {
    const events: Record<string, Array<() => void>> = {};
    const raw: RawRequest = new Request("http://localhost/close-before-complete") as RawRequest;
    raw.complete = false;
    raw.on = (event: string, listener: () => void) => {
      (events[event] ||= []).push(listener);
    };

    const c = createMinimalContext(raw);
    c.set("requestId", "r1");
    const next: Next = async () => {};

    await clientDisconnectMiddleware(c as unknown as Context, next);
    const ac = c.get<AbortController>("abortController");
    expect(ac.signal.aborted).toBe(false);

    events["close"][0]();

    expect(ac.signal.aborted).toBe(true);
    expect(logSpy).toHaveBeenCalledWith("[Request r1] Client disconnected (TCP close)");
  });

  it("does NOT abort when close fires after completion flag set", async () => {
    const events: Record<string, Array<() => void>> = {};
    const raw: RawRequest = new Request("http://localhost/close-after-complete") as RawRequest;
    raw.complete = true; // already finished
    raw.on = (event: string, listener: () => void) => {
      (events[event] ||= []).push(listener);
    };

    const c = createMinimalContext(raw);
    c.set("requestId", "r2");
    const next: Next = async () => {};

    await clientDisconnectMiddleware(c as unknown as Context, next);
    const ac = c.get<AbortController>("abortController");

    events["close"][0]();

    expect(ac.signal.aborted).toBe(false);
    expect(logSpy).not.toHaveBeenCalledWith("[Request r2] Client disconnected (TCP close)");
  });

  it("aborts when underlying request signal aborts", async () => {
    const upstream = new AbortController();
    const raw: RawRequest = new Request("http://localhost/with-signal", { signal: upstream.signal }) as RawRequest;

    const c = createMinimalContext(raw);
    c.set("requestId", "r3");
    const next: Next = async () => {};

    await clientDisconnectMiddleware(c as unknown as Context, next);
    const ac = c.get<AbortController>("abortController");
    expect(ac.signal.aborted).toBe(false);

    upstream.abort();

    expect(ac.signal.aborted).toBe(true);
    expect(logSpy).toHaveBeenCalledWith("[Request r3] Request aborted by client signal");
  });
});
