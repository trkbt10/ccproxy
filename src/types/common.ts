// Common type definitions used across the application

/**
 * A record with string keys and unknown values
 */
export type UnknownRecord = Record<string, unknown>;

/**
 * A generic model type constructor
 */
export type ModelArrayType<T extends readonly string[]> = T[number];