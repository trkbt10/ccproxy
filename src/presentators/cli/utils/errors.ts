import { existsSync } from "node:fs";

/**
 * Exits the process with an error message
 */
export function exitWithError(message: string, code: number = 1): never {
  console.error(message);
  process.exit(code);
}

/**
 * Ensures a config file exists, exits with error if not
 */
export function ensureConfigExists(filePath: string): void {
  if (!existsSync(filePath)) {
    exitWithError(`Config file not found: ${filePath}`);
  }
}

/**
 * Ensures a required argument is provided, exits with error if not
 */
export function ensureArgument<T>(
  arg: T | undefined,
  errorMessage: string
): asserts arg is T {
  if (arg === undefined || arg === null) {
    exitWithError(errorMessage);
  }
}

/**
 * Checks if a file exists with force option support
 */
export function checkFileExistsWithForce(
  filePath: string,
  force: boolean = false,
  errorMessage?: string
): void {
  if (existsSync(filePath) && !force) {
    exitWithError(
      errorMessage || `File already exists: ${filePath} (use --force to overwrite)`
    );
  }
}