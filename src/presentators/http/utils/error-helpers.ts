// Shared Hono error utilities to keep handlers DRY

export function isErrorWithStatus(err: unknown): err is Error & { status: number } {
  if (!(err instanceof Error)) return false;
  const anyErr = err as Error & { status?: unknown };
  return typeof anyErr.status === "number";
}

