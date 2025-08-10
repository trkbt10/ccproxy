import type { Hono } from "hono";

type UnknownRecord = Record<string, unknown>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function extractFromArrayRoutes(routes: unknown[], fallbackMethod?: string): string[] {
  const out: string[] = [];
  for (const r of routes) {
    if (typeof r !== "object" || r === null) continue;
    const rec = r as UnknownRecord;
    const method = asString(rec.method ?? fallbackMethod ?? "").toUpperCase();
    const path = asString(rec.path) || asString(rec.pattern) || asString(rec.route);
    if (method && path) out.push(`${method} ${path}`);
  }
  return out;
}

function extractFromRoutes(routes: unknown): string[] {
  // Case 1: array of route entries
  if (Array.isArray(routes)) {
    return extractFromArrayRoutes(routes);
  }

  // Case 2: object map: method -> routeEntry[]
  if (routes && typeof routes === "object") {
    const out: string[] = [];
    const map = routes as UnknownRecord;
    for (const key of Object.keys(map)) {
      const arr = map[key];
      if (Array.isArray(arr)) {
        out.push(...extractFromArrayRoutes(arr, key));
      }
    }
    return out;
  }

  return [];
}

export function extractEndpoints(app: Hono): string[] {
  const endpoints: string[] = [];
  const obj: unknown = app;
  if (typeof obj !== "object" || obj === null) return endpoints;
  const o = obj as UnknownRecord;

  const candidates: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(o, "routes")) candidates.push((o as UnknownRecord).routes);
  if (Object.prototype.hasOwnProperty.call(o, "_routes")) candidates.push((o as UnknownRecord)._routes);
  const router = (o as UnknownRecord).router;
  if (router && typeof router === "object") {
    const ro = router as UnknownRecord;
    if (Object.prototype.hasOwnProperty.call(ro, "routes")) candidates.push(ro.routes);
  }

  for (const r of candidates) {
    endpoints.push(...extractFromRoutes(r));
  }

  return unique(endpoints).sort();
}
