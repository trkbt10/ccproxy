import type { Provider } from "../../../config/types";
import { buildOpenAICompatibleClient } from "../openai-client";

type CacheEntry = {
  data: string[] | null;
  fetchedAt: number | null;
  loading: Promise<string[]> | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new WeakMap<Provider, CacheEntry>();

function now() {
  return Date.now();
}

function isFreshRaw(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.fetchedAt == null || entry.data == null) return false;
  return now() - entry.fetchedAt < CACHE_TTL_MS;
}

export async function getCachedModelIds(provider: Provider, modelHint?: string): Promise<string[]> {
  const existing = cache.get(provider) as CacheEntry | undefined;
  if (isFreshRaw(existing)) return (existing!.data as string[]);
  if (existing && existing.loading) return existing.loading;

  const newEntry: CacheEntry = existing || { data: null, fetchedAt: null, loading: null };
  const load = (async () => {
    try {
      const client = buildOpenAICompatibleClient(provider, modelHint);
      const res = await client.models.list();
      const ids = res.data.map((m) => m.id);
      newEntry.data = ids;
      newEntry.fetchedAt = now();
      newEntry.loading = null;
      return ids;
    } catch {
      // On error, do not update fetchedAt; allow next caller to retry
      newEntry.loading = null;
      return [];
    }
  })();
  newEntry.loading = load;
  cache.set(provider, newEntry);
  return load;
}

export function clearModelListCacheFor(provider: Provider): void {
  cache.delete(provider);
}

export function clearAllModelListCache(): void {
  // WeakMap cannot be iterated; rely on GC or restart to fully clear.
}
