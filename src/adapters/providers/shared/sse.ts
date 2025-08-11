// Simple SSE JSON line parser used by streaming adapters
// - Trims whitespace
// - Strips optional `data:` prefix
// - Ignores `[DONE]`
// - Parses JSON, returns null on failure
export function parseSSELine(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const dataPrefix = /^data:\s*/i;
  const payload = dataPrefix.test(trimmed)
    ? trimmed.replace(dataPrefix, "")
    : trimmed;
  if (payload === "[DONE]") return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

