/**
 * @fileoverview Main entry point for OpenAI-generic provider
 * 
 * Why: Provides a clean public API for the OpenAI-generic provider,
 * exposing only the factory function needed by consumers.
 */

export { buildOpenAIGenericAdapter } from './factory';