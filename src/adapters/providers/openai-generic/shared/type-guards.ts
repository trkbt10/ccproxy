/**
 * @fileoverview Common type guard utilities for OpenAI API type checking
 * 
 * Why: Provides reusable type guards that are shared between chat and responses
 * APIs to ensure type safety and avoid duplication.
 */

/**
 * Type guard to check if a value is a non-null object
 */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}