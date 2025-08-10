/**
 * Get a value from an object using a dot-notation path
 * 
 * @param obj - The object to get the value from
 * @param dotPath - Dot-notation path (e.g., "providers.default.apiKey")
 * @returns The value at the specified path, or undefined if not found
 * 
 * @example
 * const config = { providers: { default: { apiKey: "secret" } } };
 * getByPath(config, "providers.default.apiKey") // returns "secret"
 * getByPath(config, "nonexistent.path") // returns undefined
 */
export function getByPath<T extends object>(obj: T, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, obj as unknown);
}

/**
 * Set a value in an object using a dot-notation path
 * Creates intermediate objects as needed
 * 
 * @param obj - The object to modify
 * @param dotPath - Dot-notation path (e.g., "providers.default.apiKey")
 * @param value - The value to set at the specified path
 * 
 * @example
 * const config = {};
 * setByPath(config, "providers.default.apiKey", "secret");
 * // config is now { providers: { default: { apiKey: "secret" } } }
 */
export function setByPath<T extends object>(obj: T, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  let cur: Record<string, unknown> = obj as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") {
      cur[k] = {} as unknown;
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}