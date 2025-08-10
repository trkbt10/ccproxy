import { readdir, stat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

interface CacheEntry {
  root: string;
  files: string[];
  expires: number;
}
let cache: CacheEntry | null = null;
const ttl = Number(process.env.INTERNAL_GLOB_CACHE_MS || 3000);
const maxFileBytes = Number(
  process.env.INTERNAL_GREP_MAX_FILE_BYTES || 256 * 1024
);

export type ReadFileLimitedResult =
  | { content: string }
  | { skipped: true; reason: string; size?: number };

function normalizeRoot(root: string) {
  return resolve(root);
}

async function walk(root: string, dir: string, out: string[]) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(root, abs, out);
    } else if (e.isFile()) {
      out.push(abs);
    }
  }
}

export async function listAllFiles(root: string) {
  const now = Date.now();
  const norm = normalizeRoot(root);
  if (cache && cache.root === norm && cache.expires > now) {
    return cache.files;
  }
  const files: string[] = [];
  await walk(norm, norm, files);
  cache = { root: norm, files, expires: now + ttl };
  return files;
}

function escapeRegex(lit: string) {
  return lit.replace(/[.*+?^${}()|[\\]\\]/g, (r) => "\\" + r);
}

// Improved glob conversion supporting **, *, ?, and dotfiles (requires explicit .)
export function globToRegExp(pattern: string) {
  const segments = pattern.split(/\\+/); // avoid backslash issues
  const src = segments
    .map((seg) => {
      return seg
        .replace(/([.+^${}()|])/g, "\\$1")
        .replace(/\\\\/g, "\\")
        .replace(/\*\*/g, "\\u0000") // temp marker
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/\\u0000/g, ".*");
    })
    .join("\\\\");
  return new RegExp("^" + src + "$");
}

export function matchGlob(files: string[], root: string, pattern: string) {
  const relPattern = pattern.startsWith(root)
    ? pattern.slice(root.length + 1)
    : pattern.replace(/^\.\//, "");
  const rx = globToRegExp(relPattern);
  return files.filter((f) => rx.test(f.slice(root.length + 1)));
}

export async function readFileLimited(
  path: string,
  maxBytes = maxFileBytes
): Promise<ReadFileLimitedResult> {
  let st;
  try {
    st = await stat(path);
  } catch {
    return { skipped: true, reason: "stat_failed" };
  }
  if (!st.isFile()) {
    return { skipped: true, reason: "not_file" };
  }
  if (st.size > maxBytes) {
    return { skipped: true, reason: "too_large", size: st.size };
  }
  try {
    const data = await readFile(path, "utf8");
    return { content: data };
  } catch {
    return { skipped: true, reason: "read_failed" };
  }
}

export function invalidateFsCache(root?: string) {
  if (!cache) {
    return;
  }
  if (!root || cache.root === normalizeRoot(root)) cache = null;
}
