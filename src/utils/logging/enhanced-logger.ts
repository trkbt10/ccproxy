import { appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

export type LogLevel = "info" | "warn" | "error" | "debug" | "unexpected";

export interface LogContext {
  requestId?: string;
  sessionId?: string;
  model?: string;
  endpoint?: string;
  [key: string]: any;
}

export interface UnexpectedBehavior {
  expected: string;
  actual: string;
  context: Record<string, any>;
  stackTrace?: string;
}

/**
 * Enhanced logger for debugging and monitoring.
 * Separates normal operations from errors and unexpected behaviors.
 */
export class EnhancedLogger {
  private normalLogPath: string;
  private errorLogPath: string;
  private unexpectedLogPath: string;
  private debugLogPath: string;
  private enabled: boolean;
  private debugEnabled: boolean;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    logDir: string = "./logs",
    enabled: boolean = true,
    debugEnabled: boolean = process.env.DEBUG === "true"
  ) {
    this.enabled = enabled;
    this.debugEnabled = debugEnabled;

    const timestamp = new Date();
    const dateStr = `${timestamp.getFullYear()}-${String(
      timestamp.getMonth() + 1
    ).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")}`;

    // Separate log files for different categories
    this.normalLogPath = join(logDir, "normal", `events-${dateStr}.jsonl`);
    this.errorLogPath = join(logDir, "errors", `errors-${dateStr}.jsonl`);
    this.unexpectedLogPath = join(
      logDir,
      "unexpected",
      `unexpected-${dateStr}.jsonl`
    );
    this.debugLogPath = join(logDir, "debug", `debug-${dateStr}.jsonl`);

    // Ensure directories exist
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      dirname(this.normalLogPath),
      dirname(this.errorLogPath),
      dirname(this.unexpectedLogPath),
      dirname(this.debugLogPath),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        try {
          await mkdir(dir, { recursive: true });
        } catch (error) {
          console.error(`Failed to create log directory ${dir}:`, error);
        }
      }
    }
  }

  /**
   * Log normal operations (success cases)
   */
  info(message: string, data?: any, context?: LogContext): void {
    if (!this.enabled) return;
    this.writeLog(this.normalLogPath, "info", message, data, context);
  }

  /**
   * Log warnings (potential issues but not errors)
   */
  warn(message: string, data?: any, context?: LogContext): void {
    if (!this.enabled) return;
    this.writeLog(this.normalLogPath, "warn", message, data, context);
  }

  /**
   * Log errors (exceptions, failures)
   * Excludes LLM execution errors which are expected
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    if (!this.enabled) return;

    // Skip LLM execution errors (rate limits, timeouts, etc.)
    if (this.isLLMExecutionError(error)) {
      this.debug(
        "LLM execution error (skipped)",
        { error: error?.message },
        context
      );
      return;
    }

    const errorData =
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : error;

    this.writeLog(this.errorLogPath, "error", message, errorData, context);
  }

  /**
   * Log unexpected behaviors for debugging
   * This is specifically for cases where the code works but doesn't behave as expected
   */
  unexpected(behavior: UnexpectedBehavior, context?: LogContext): void {
    if (!this.enabled) return;

    const data = {
      ...behavior,
      timestamp: new Date().toISOString(),
      context: { ...behavior.context, ...context },
    };

    this.writeLog(
      this.unexpectedLogPath,
      "unexpected",
      `Unexpected: Expected ${behavior.expected} but got ${behavior.actual}`,
      data,
      context
    );

    // Also log to console in development
    if (this.debugEnabled) {
      console.warn("[UNEXPECTED]", behavior);
    }
  }

  /**
   * Debug logging (verbose, only when DEBUG=true)
   */
  debug(message: string, data?: any, context?: LogContext): void {
    if (!this.debugEnabled) return;
    this.writeLog(this.debugLogPath, "debug", message, data, context);
  }

  /**
   * Log request/response pairs for analysis
   */
  logRequestResponse(
    request: any,
    response: any,
    duration: number,
    context?: LogContext
  ): void {
    if (!this.enabled) return;

    const isError = response?.error || response?.status >= 400;
    const logPath = isError ? this.errorLogPath : this.normalLogPath;

    this.writeLog(
      logPath,
      isError ? "error" : "info",
      "Request/Response",
      {
        request,
        response,
        duration,
      },
      context
    );
  }

  /**
   * Log conversion issues
   */
  logConversionIssue(
    from: string,
    to: string,
    input: any,
    error: string,
    context?: LogContext
  ): void {
    this.unexpected(
      {
        expected: `Successful conversion from ${from} to ${to}`,
        actual: error,
        context: {
          from,
          to,
          input,
        },
      },
      context
    );
  }

  /**
   * Check if an error is an expected LLM execution error
   */
  private isLLMExecutionError(error: any): boolean {
    if (!error) {
      return false;
    }

    const message = error.message?.toLowerCase() || "";
    const llmErrors = [
      "rate limit",
      "timeout",
      "quota exceeded",
      "model overloaded",
      "connection refused",
      "econnreset",
      "socket hang up",
      "network error",
      "503 service unavailable",
      "429 too many requests",
    ];

    return llmErrors.some((err) => message.includes(err));
  }

  /**
   * Core write function
   */
  private writeLog(
    logPath: string,
    level: LogLevel,
    message: string,
    data?: any,
    context?: LogContext
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context,
      pid: process.pid,
    };

    // Queue writes to maintain order
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          await appendFile(logPath, JSON.stringify(logEntry) + "\n");
        } catch (error) {
          // Only log to console, don't disrupt main flow
          console.error(
            `[EnhancedLogger] Failed to write to ${logPath}:`,
            error
          );
        }
      })
      .catch(() => {
        // Prevent unhandled promise rejections
      });
  }

  /**
   * Utility to capture current state for debugging
   */
  captureState(
    label: string,
    state: Record<string, any>,
    context?: LogContext
  ): void {
    this.debug(`State capture: ${label}`, state, context);
  }

  /**
   * Log performance metrics
   */
  logPerformance(
    operation: string,
    duration: number,
    metadata?: any,
    context?: LogContext
  ): void {
    const data = {
      operation,
      duration,
      metadata,
    };

    if (duration > 5000) {
      this.warn(
        `Slow operation: ${operation} took ${duration}ms`,
        data,
        context
      );
    } else {
      this.info(`Performance: ${operation}`, data, context);
    }
  }
}

// Singleton instance
let logger: EnhancedLogger | null = null;
let loggerOptions: { dir?: string; enabled?: boolean; debugEnabled?: boolean } = {};

/**
 * Get or create the singleton logger instance
 */
export function getLogger(): EnhancedLogger {
  if (!logger) {
    logger = new EnhancedLogger(
      loggerOptions.dir || "./logs",
      loggerOptions.enabled ?? true,
      loggerOptions.debugEnabled ?? (process.env.DEBUG === "true")
    );
  }
  return logger;
}

/**
 * Configure the logger singleton options before first use
 */
export function configureLogger(options: {
  dir?: string;
  enabled?: boolean;
  debugEnabled?: boolean;
}): void {
  // If already created, ignore for now to avoid mid-run reconfiguration
  if (logger) return;
  loggerOptions = { ...loggerOptions, ...options };
}
