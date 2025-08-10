import { getLogger, type LogContext } from "./enhanced-logger";

/**
 * Helper functions to migrate from console.log/error to enhanced logger
 */

export function logInfo(message: string, data?: any, context?: LogContext): void {
  const logger = getLogger();
  logger.info(message, data, context);
  if (process.env.DEBUG === "true") {
    console.log(`[INFO] ${message}`, data);
  }
}

export function logError(message: string, error?: any, context?: LogContext): void {
  const logger = getLogger();
  logger.error(message, error, context);
  console.error(`[ERROR] ${message}`, error);
}

export function logWarn(message: string, data?: any, context?: LogContext): void {
  const logger = getLogger();
  logger.warn(message, data, context);
  if (process.env.DEBUG === "true") {
    console.warn(`[WARN] ${message}`, data);
  }
}

export function logDebug(message: string, data?: any, context?: LogContext): void {
  const logger = getLogger();
  logger.debug(message, data, context);
  if (process.env.DEBUG === "true") {
    console.log(`[DEBUG] ${message}`, data);
  }
}

export function logUnexpected(
  expected: string,
  actual: string,
  contextData: Record<string, any>,
  context?: LogContext
): void {
  const logger = getLogger();
  logger.unexpected(
    {
      expected,
      actual,
      context: contextData,
    },
    context
  );
}

export function logRequestResponse(
  request: any,
  response: any,
  duration: number,
  context?: LogContext
): void {
  const logger = getLogger();
  logger.logRequestResponse(request, response, duration, context);
}

export function logConversionIssue(
  from: string,
  to: string,
  input: any,
  error: string,
  context?: LogContext
): void {
  const logger = getLogger();
  logger.logConversionIssue(from, to, input, error, context);
}

export function captureState(label: string, state: Record<string, any>, context?: LogContext): void {
  const logger = getLogger();
  logger.captureState(label, state, context);
}

export function logPerformance(
  operation: string,
  duration: number,
  metadata?: any,
  context?: LogContext
): void {
  const logger = getLogger();
  logger.logPerformance(operation, duration, metadata, context);
}

// Export the logger instance for direct use
// No default logger export to avoid early instantiation
