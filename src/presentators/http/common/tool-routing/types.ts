/**
 * Common Tool Routing Types
 * 
 * Shared types for tool routing that can be used by any API endpoint
 * (Claude, OpenAI, Gemini, etc.)
 */

import type { ToolRuntime } from "../../../../tools/runtime/types";

/**
 * Tool source selection strategy
 */
export type ToolSourceStrategy =
  | "builtin-only"      // Use only endpoint-specific builtin tools
  | "dtg-only"          // Use only dynamically generated tools
  | "builtin-first"     // Try builtin first, fallback to DTG
  | "dtg-first"         // Try DTG first, fallback to builtin
  | "llm-passthrough"   // Don't intercept, let LLM handle it
  | "custom";           // Custom selection logic

/**
 * Tool source information
 */
export interface ToolSource {
  type: "builtin" | "dtg" | "external";
  tool?: ToolRuntime;
  available: boolean;
}

/**
 * Context for tool selection
 */
export interface ToolSelectionContext {
  toolName: string;
  input: unknown;
  conversationId?: string;
  requestId?: string;
  availableSources: ToolSource[];
}

/**
 * Tool routing configuration
 */
export interface ToolRoutingMap {
  [toolName: string]: ToolSourceStrategy;
}

/**
 * Base configuration for endpoint tool handling
 */
export interface BaseToolConfig {
  // Tool routing configuration
  routing: ToolRoutingMap;
  
  // Whether to enable DTG for this endpoint
  enableDTG: boolean;
  
  // Whether to enable builtin tools
  enableBuiltin: boolean;
  
  // Custom tool overrides
  toolOverrides?: Record<string, ToolRuntime>;
}

/**
 * Tool provider interface for endpoint-specific tools
 */
export interface ToolProvider {
  /**
   * Get all builtin tools for this endpoint
   */
  getBuiltinTools(): ToolRuntime[];
  
  /**
   * Get default routing configuration
   */
  getDefaultRouting(): ToolRoutingMap;
  
  /**
   * Check if a tool is endpoint-specific
   */
  isEndpointSpecific(toolName: string): boolean;
}