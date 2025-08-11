/**
 * Executes a function with error handling and fallback value
 */
export async function tryWithFallback<T>(
  fn: () => T | Promise<T>,
  fallback: T,
  onError?: (error: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (onError) {
      onError(error);
    }
    return fallback;
  }
}

/**
 * Executes a function with error handling and logging
 */
export async function tryWithLog<T>(
  fn: () => T | Promise<T>,
  logMessage: string,
  logger: (message: string, error: unknown) => void = console.warn
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logger(logMessage, error);
    return undefined;
  }
}