/**
 * Unified ID Management System
 * 
 * This module consolidates all ID-related functionality:
 * - ID mapping between OpenAI and Claude formats
 * - ID prefix validation and fixing
 * - Tool chain validation
 * - Auto-fixing of ID-related issues
 */

import { logDebug, logWarn, logError, logInfo, logUnexpected } from "../logging/migrate-logger";

// ============================================================================
// Core Types and Interfaces
// ============================================================================

// Context type for tracking where mappings come from
export interface MappingContext {
  source?: string;
  requestId?: string;
  conversationId?: string;
  [key: string]: unknown; // Allow additional properties
}

export interface IdMappingEntry {
  openaiCallId: string;
  claudeToolUseId: string;
  toolName?: string;
  createdAt: Date;
  usedAt?: Date;
  status: "pending" | "used" | "orphaned";
  context?: MappingContext;
}

export interface IdMappingStats {
  totalMappings: number;
  pendingMappings: number;
  usedMappings: number;
  orphanedMappings: number;
  prefixConversions: number;
  errors: string[];
}

export interface ToolCall {
  id: string;
  call_id?: string;
  name: string;
  arguments?: Record<string, unknown> | string;
}

export interface ToolResult {
  tool_use_id: string;
  content: string | Record<string, unknown>;
}

export interface IssueContext {
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  existing?: ToolCall;
  expectedToolId?: string;
  actualToolId?: string;
  [key: string]: unknown;
}

export interface ToolChainIssue {
  type: "missing_tool_result" | "missing_tool_call" | "duplicate_id" | "mapping_mismatch";
  description: string;
  context: IssueContext;
  timestamp: Date;
  requestId?: string;
  conversationId?: string;
}

export interface FixDetails {
  generatedResult?: {
    tool_use_id: string;
    content: string;
  };
  [key: string]: unknown;
}

export interface ToolChainFix {
  issue: ToolChainIssue;
  action: string;
  result: "success" | "failed" | "partial";
  details?: FixDetails;
  timestamp: Date;
}

// ============================================================================
// ID Format Constants and Utilities
// ============================================================================

export class IdFormat {
  // Valid prefixes for OpenAI API
  static readonly OPENAI_VALID_PREFIXES = ["fc_", "call_"] as const;
  
  // Valid prefixes for Claude API
  static readonly CLAUDE_VALID_PREFIXES = ["toolu_"] as const;
  
  // Known invalid/legacy prefixes that need conversion
  static readonly INVALID_PREFIXES = ["ws_", "tool_", "tc_"] as const;
  
  // Default prefix for new OpenAI IDs
  static readonly DEFAULT_OPENAI_PREFIX = "call_";
  
  // Default prefix for new Claude IDs
  static readonly DEFAULT_CLAUDE_PREFIX = "toolu_";
  
  /**
   * Check if an ID has a valid OpenAI prefix
   */
  static isValidOpenAIPrefix(id: string): boolean {
    return IdFormat.OPENAI_VALID_PREFIXES.some(prefix => id.startsWith(prefix));
  }
  
  /**
   * Check if an ID has a valid Claude prefix
   */
  static isValidClaudePrefix(id: string): boolean {
    return IdFormat.CLAUDE_VALID_PREFIXES.some(prefix => id.startsWith(prefix));
  }
  
  /**
   * Fix an ID to have a valid OpenAI prefix
   */
  static fixOpenAIPrefix(id: string, context?: string): string {
    // If already valid, return as-is
    if (IdFormat.isValidOpenAIPrefix(id)) {
      return id;
    }
    
    // Check for known invalid prefixes
    for (const invalidPrefix of IdFormat.INVALID_PREFIXES) {
      if (id.startsWith(invalidPrefix)) {
        const fixedId = IdFormat.DEFAULT_OPENAI_PREFIX + id.substring(invalidPrefix.length);
        logDebug(
          `Fixed OpenAI ID prefix`,
          { original: id, fixed: fixedId, context: context || "unknown" }
        );
        return fixedId;
      }
    }
    
    // If no known prefix, add default prefix
    if (!id.includes("_")) {
      const fixedId = IdFormat.DEFAULT_OPENAI_PREFIX + id;
      logWarn(
        `ID has no prefix, adding ${IdFormat.DEFAULT_OPENAI_PREFIX}`,
        { original: id, fixed: fixedId, context: context || "unknown" }
      );
      return fixedId;
    }
    
    // Unknown prefix pattern, replace everything before first underscore
    const underscoreIndex = id.indexOf("_");
    const fixedId = IdFormat.DEFAULT_OPENAI_PREFIX + id.substring(underscoreIndex + 1);
    logWarn(
      `Unknown ID prefix pattern, replacing with ${IdFormat.DEFAULT_OPENAI_PREFIX}`,
      { original: id, fixed: fixedId, context: context || "unknown" }
    );
    return fixedId;
  }
  
  /**
   * Generate a new OpenAI-format ID
   */
  static generateOpenAIId(): string {
    return `${IdFormat.DEFAULT_OPENAI_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  /**
   * Generate a new Claude-format ID
   */
  static generateClaudeId(): string {
    return `${IdFormat.DEFAULT_CLAUDE_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  /**
   * Extract the ID without prefix
   */
  static extractIdWithoutPrefix(id: string): string {
    const underscoreIndex = id.indexOf("_");
    if (underscoreIndex === -1) {
      return id;
    }
    return id.substring(underscoreIndex + 1);
  }
  
  /**
   * Check if two IDs are the same ignoring prefix
   */
  static isSameIdIgnoringPrefix(id1: string, id2: string): boolean {
    return IdFormat.extractIdWithoutPrefix(id1) === IdFormat.extractIdWithoutPrefix(id2);
  }
}

// ============================================================================
// Unified ID Manager
// ============================================================================

export class UnifiedIdManager {
  // ID mappings
  private mappings: Map<string, IdMappingEntry> = new Map();
  private reverseMapping: Map<string, string> = new Map(); // claudeId -> openaiId
  
  // Tool chain tracking
  private pendingToolCalls: Map<string, ToolCall> = new Map();
  private processedToolResults: Set<string> = new Set();
  
  // Statistics and debugging
  private prefixConversionLog: Array<{ original: string; fixed: string; timestamp: Date }> = [];
  private issues: ToolChainIssue[] = [];
  private fixes: ToolChainFix[] = [];
  private readonly maxLogSize = 100;
  
  // Static methods for backward compatibility with CallIdManager
  static readonly VALID_PREFIXES = IdFormat.OPENAI_VALID_PREFIXES;
  static readonly INVALID_PREFIXES = IdFormat.INVALID_PREFIXES;
  static readonly VALID_PREFIX = IdFormat.DEFAULT_OPENAI_PREFIX;
  
  static fixIdPrefix = IdFormat.fixOpenAIPrefix;
  static isValidPrefix = IdFormat.isValidOpenAIPrefix;
  static extractIdWithoutPrefix = IdFormat.extractIdWithoutPrefix;
  static isSameIdIgnoringPrefix = IdFormat.isSameIdIgnoringPrefix;
  
  constructor(private conversationId?: string) {}
  
  // ============================================================================
  // ID Mapping Methods
  // ============================================================================
  
  /**
   * Register a new ID mapping
   */
  registerMapping(
    openaiCallId: string,
    claudeToolUseId: string,
    toolName?: string,
    context?: MappingContext
  ): void {
    // Validate and fix IDs if needed
    const validOpenAIId = IdFormat.isValidOpenAIPrefix(openaiCallId) 
      ? openaiCallId 
      : IdFormat.fixOpenAIPrefix(openaiCallId, "register_mapping");
    
    // Check for duplicates
    if (this.mappings.has(validOpenAIId)) {
      const existing = this.mappings.get(validOpenAIId)!;
      logWarn(
        "Duplicate call ID mapping detected",
        {
          openaiCallId: validOpenAIId,
          existingClaudeId: existing.claudeToolUseId,
          newClaudeId: claudeToolUseId,
        },
        { conversationId: this.conversationId }
      );
    }
    
    // Store the mapping
    const entry: IdMappingEntry = {
      openaiCallId: validOpenAIId,
      claudeToolUseId,
      toolName,
      createdAt: new Date(),
      status: "pending",
      context,
    };
    
    this.mappings.set(validOpenAIId, entry);
    this.reverseMapping.set(claudeToolUseId, validOpenAIId);
    
    logDebug(
      "Registered ID mapping",
      {
        openaiCallId: validOpenAIId,
        claudeToolUseId,
        toolName,
      },
      { conversationId: this.conversationId }
    );
  }
  
  /**
   * Get OpenAI call ID from Claude tool use ID
   */
  getOpenAICallId(claudeToolUseId: string): string | undefined {
    // Direct lookup
    const directResult = this.reverseMapping.get(claudeToolUseId);
    if (directResult) {
      this.markAsUsed(directResult);
      return directResult;
    }
    
    // Try to find by ignoring prefix
    for (const [claudeId, openaiId] of this.reverseMapping.entries()) {
      if (IdFormat.isSameIdIgnoringPrefix(claudeId, claudeToolUseId)) {
        logDebug(
          "Found mapping by ignoring prefix",
          { original: claudeToolUseId, matched: claudeId, openaiId },
          { conversationId: this.conversationId }
        );
        this.markAsUsed(openaiId);
        return openaiId;
      }
    }
    
    logWarn(
      "No OpenAI call ID found for Claude tool use ID",
      { claudeToolUseId },
      { conversationId: this.conversationId }
    );
    return undefined;
  }
  
  /**
   * Get Claude tool use ID from OpenAI call ID
   */
  getClaudeToolUseId(openaiCallId: string): string | undefined {
    const entry = this.mappings.get(openaiCallId);
    
    if (entry) {
      this.markAsUsed(openaiCallId);
      return entry.claudeToolUseId;
    }
    
    // Try to find by ignoring prefix
    for (const [oId, mapping] of this.mappings.entries()) {
      if (IdFormat.isSameIdIgnoringPrefix(oId, openaiCallId)) {
        logDebug(
          "Found mapping by ignoring prefix",
          { original: openaiCallId, matched: oId, claudeId: mapping.claudeToolUseId },
          { conversationId: this.conversationId }
        );
        this.markAsUsed(oId);
        return mapping.claudeToolUseId;
      }
    }
    
    logWarn(
      "No Claude tool use ID found for OpenAI call ID",
      { openaiCallId },
      { conversationId: this.conversationId }
    );
    return undefined;
  }
  
  /**
   * Mark a mapping as used
   */
  private markAsUsed(openaiCallId: string): void {
    const entry = this.mappings.get(openaiCallId);
    if (entry) {
      entry.status = "used";
      entry.usedAt = new Date();
    }
  }
  
  // ============================================================================
  // Tool Chain Validation Methods
  // ============================================================================
  
  /**
   * Record a tool call
   */
  recordToolCall(toolCall: ToolCall): void {
    const callId = toolCall.call_id || toolCall.id;
    
    // Check for duplicates
    if (this.pendingToolCalls.has(callId)) {
      this.recordIssue({
        type: "duplicate_id",
        description: `Duplicate tool call ID: ${callId}`,
        context: { toolCall, existing: this.pendingToolCalls.get(callId) },
        timestamp: new Date(),
        conversationId: this.conversationId,
      });
    }
    
    this.pendingToolCalls.set(callId, toolCall);
    
    logDebug(
      "Recorded tool call",
      { callId, toolName: toolCall.name },
      { conversationId: this.conversationId }
    );
  }
  
  /**
   * Record a tool result
   */
  recordToolResult(toolResult: ToolResult): void {
    const toolUseId = toolResult.tool_use_id;
    
    // Find the corresponding tool call
    const openaiCallId = this.getOpenAICallId(toolUseId);
    
    if (openaiCallId && this.pendingToolCalls.has(openaiCallId)) {
      this.pendingToolCalls.delete(openaiCallId);
      this.processedToolResults.add(toolUseId);
      
      logDebug(
        "Matched tool result to call",
        { toolUseId, openaiCallId },
        { conversationId: this.conversationId }
      );
    } else {
      this.recordIssue({
        type: "missing_tool_call",
        description: `Tool result without matching call: ${toolUseId}`,
        context: { toolResult },
        timestamp: new Date(),
        conversationId: this.conversationId,
      });
    }
  }
  
  /**
   * Validate tool chain at end of turn
   */
  validateEndOfTurn(): void {
    // Check for orphaned tool calls
    for (const [callId, toolCall] of this.pendingToolCalls.entries()) {
      this.recordIssue({
        type: "missing_tool_result",
        description: `Tool call without result: ${callId}`,
        context: { toolCall },
        timestamp: new Date(),
        conversationId: this.conversationId,
      });
      
      // Attempt auto-fix
      this.autoFixMissingToolResult(callId, toolCall);
    }
    
    // Reset for next turn
    this.pendingToolCalls.clear();
    this.processedToolResults.clear();
  }
  
  // ============================================================================
  // Auto-Fixing Methods
  // ============================================================================
  
  /**
   * Auto-fix missing tool result
   */
  private async autoFixMissingToolResult(callId: string, toolCall: ToolCall): Promise<void> {
    const fix: ToolChainFix = {
      issue: {
        type: "missing_tool_result",
        description: `Missing result for tool call ${callId}`,
        context: { toolCall },
        timestamp: new Date(),
        conversationId: this.conversationId,
      },
      action: "Generate placeholder result",
      result: "success",
      details: {
        generatedResult: {
          tool_use_id: callId,
          content: "Tool execution failed or timed out",
        },
      },
      timestamp: new Date(),
    };
    
    this.fixes.push(fix);
    
    logInfo(
      "Auto-fixed missing tool result",
      { callId, toolName: toolCall.name },
      { conversationId: this.conversationId }
    );
  }
  
  // ============================================================================
  // Statistics and Debugging
  // ============================================================================
  
  /**
   * Get statistics
   */
  getStats(): IdMappingStats {
    let pending = 0;
    let used = 0;
    let orphaned = 0;
    const errors: string[] = [];
    
    for (const entry of this.mappings.values()) {
      switch (entry.status) {
        case "pending":
          pending++;
          break;
        case "used":
          used++;
          break;
        case "orphaned":
          orphaned++;
          errors.push(`Orphaned: ${entry.openaiCallId} -> ${entry.claudeToolUseId}`);
          break;
      }
    }
    
    // Add recent issues to errors
    this.issues.slice(-5).forEach(issue => {
      errors.push(`${issue.type}: ${issue.description}`);
    });
    
    return {
      totalMappings: this.mappings.size,
      pendingMappings: pending,
      usedMappings: used,
      orphanedMappings: orphaned,
      prefixConversions: this.prefixConversionLog.length,
      errors,
    };
  }

  /**
   * Find OpenAI call ID for a Claude tool_use ID without marking it as used
   */
  private peekOpenAICallId(claudeToolUseId: string): string | undefined {
    // Direct lookup
    const direct = this.reverseMapping.get(claudeToolUseId);
    if (direct) {
      return direct;
    }
    // Try by ignoring prefix
    for (const [claudeId, openaiId] of this.reverseMapping.entries()) {
      if (IdFormat.isSameIdIgnoringPrefix(claudeId, claudeToolUseId)) {
        return openaiId;
      }
    }
    return undefined;
  }

  /**
   * Get existing or create a new OpenAI call_id for a given Claude tool_use_id,
   * registering the mapping if it doesn't exist. Does NOT mark as used.
   */
  getOrCreateOpenAICallIdForToolUse(
    claudeToolUseId: string,
    toolName?: string,
    context?: MappingContext
  ): string {
    const existing = this.peekOpenAICallId(claudeToolUseId);
    if (existing) {
      return existing;
    }
    const callId = IdFormat.generateOpenAIId();
    this.registerMapping(callId, claudeToolUseId, toolName, context);
    return callId;
  }

  /**
   * Purge mappings that have been used.
   * @param olderThanMs Only purge if usedAt is older than this threshold (default 0 = immediately)
   * @returns number of purged mappings
   */
  purgeUsed(olderThanMs: number = 0): number {
    const now = Date.now();
    let purged = 0;
    for (const [openaiId, entry] of this.mappings.entries()) {
      if (entry.status === "used" && entry.usedAt) {
        const age = now - entry.usedAt.getTime();
        if (age >= olderThanMs) {
          // remove reverse mapping first
          this.reverseMapping.delete(entry.claudeToolUseId);
          this.mappings.delete(openaiId);
          purged++;
        }
      }
    }
    if (purged > 0) {
      logDebug(
        "Purged used call_id mappings",
        { purged, thresholdMs: olderThanMs, remaining: this.mappings.size },
        { conversationId: this.conversationId }
      );
    }
    return purged;
  }

  /**
   * Validate all mappings
   */
  validateMappings(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for orphaned mappings
    const orphaned = Array.from(this.mappings.values()).filter(
      (e) => e.status === "orphaned"
    );
    if (orphaned.length > 0) {
      issues.push(`Found ${orphaned.length} orphaned mappings`);
    }
    
    // Check for duplicate Claude IDs
    const claudeIds = new Set<string>();
    for (const entry of this.mappings.values()) {
      if (claudeIds.has(entry.claudeToolUseId)) {
        issues.push(`Duplicate Claude ID: ${entry.claudeToolUseId}`);
      }
      claudeIds.add(entry.claudeToolUseId);
    }
    
    // Check for invalid prefixes
    for (const entry of this.mappings.values()) {
      if (!IdFormat.isValidOpenAIPrefix(entry.openaiCallId)) {
        issues.push(`Invalid OpenAI ID prefix: ${entry.openaiCallId}`);
      }
    }
    
    if (issues.length > 0) {
      logUnexpected(
        "ID mapping validation failed",
        `Found ${issues.length} issues`,
        { issues, stats: this.getStats() },
        { conversationId: this.conversationId }
      );
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }
  
  /**
   * Generate debug report
   */
  generateDebugReport(): string {
    const stats = this.getStats();
    const validation = this.validateMappings();
    
    const report = [
      `=== Unified ID Manager Debug Report ===`,
      `Conversation ID: ${this.conversationId || "unknown"}`,
      `Generated at: ${new Date().toISOString()}`,
      ``,
      `=== Statistics ===`,
      `Total Mappings: ${stats.totalMappings}`,
      `Pending: ${stats.pendingMappings}`,
      `Used: ${stats.usedMappings}`,
      `Orphaned: ${stats.orphanedMappings}`,
      `Prefix Conversions: ${stats.prefixConversions}`,
      ``,
      `=== Validation ===`,
      `Valid: ${validation.valid}`,
      validation.issues.length > 0 ? `Issues:\n${validation.issues.map(i => `  - ${i}`).join("\n")}` : "",
      ``,
      `=== Current Mappings ===`,
    ];
    
    for (const [openaiId, entry] of this.mappings.entries()) {
      report.push(
        `${entry.status.padEnd(8)} | ${openaiId} -> ${entry.claudeToolUseId}${
          entry.toolName ? ` (${entry.toolName})` : ""
        }`
      );
    }
    
    if (this.issues.length > 0) {
      report.push(``, `=== Recent Issues ===`);
      for (const issue of this.issues.slice(-10)) {
        report.push(`${issue.timestamp.toISOString()} | ${issue.type}: ${issue.description}`);
      }
    }
    
    if (this.fixes.length > 0) {
      report.push(``, `=== Recent Fixes ===`);
      for (const fix of this.fixes.slice(-10)) {
        report.push(`${fix.timestamp.toISOString()} | ${fix.action} (${fix.result})`);
      }
    }
    
    return report.join("\n");
  }
  
  /**
   * Record an issue
   */
  private recordIssue(issue: ToolChainIssue): void {
    this.issues.push(issue);
    
    // Keep log size manageable
    if (this.issues.length > this.maxLogSize) {
      this.issues.shift();
    }
    
    logWarn(
      `Tool chain issue: ${issue.type}`,
      { description: issue.description, context: issue.context },
      { conversationId: this.conversationId }
    );
  }
  
  /**
   * Clear all data
   */
  clear(): void {
    this.mappings.clear();
    this.reverseMapping.clear();
    this.pendingToolCalls.clear();
    this.processedToolResults.clear();
    this.prefixConversionLog = [];
    this.issues = [];
    this.fixes = [];
  }
  
  // ============================================================================
  // Backward Compatibility Methods
  // ============================================================================
  
  /**
   * Get all mappings as a Map (for backward compatibility)
   */
  getMappingAsMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [openaiId, entry] of this.mappings.entries()) {
      map.set(openaiId, entry.claudeToolUseId);
    }
    return map;
  }
  
  /**
   * Import mappings from a Map (for backward compatibility)
   */
  importFromMap(map: Map<string, string>, context?: MappingContext): void {
    for (const [openaiId, claudeId] of map.entries()) {
      this.registerMapping(openaiId, claudeId, undefined, context);
    }
  }
}

// ============================================================================
// Global Registry
// ============================================================================

/**
 * Global registry for managing UnifiedIdManager instances per conversation
 */
class UnifiedIdRegistry {
  private managers: Map<string, UnifiedIdManager> = new Map();
  
  getManager(conversationId: string): UnifiedIdManager {
    if (!this.managers.has(conversationId)) {
      this.managers.set(conversationId, new UnifiedIdManager(conversationId));
    }
    return this.managers.get(conversationId)!;
  }
  
  clearManager(conversationId: string): void {
    try {
      const manager = this.managers.get(conversationId);
      if (manager) {
        manager.clear();
        this.managers.delete(conversationId);
      }
    } catch (error) {
      // Log the error but don't throw - this is a cleanup operation
      logWarn(
        "Failed to clear UnifiedIdManager",
        { conversationId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  generateGlobalReport(): string {
    const reports: string[] = [];
    for (const [convId, manager] of this.managers.entries()) {
      reports.push(manager.generateDebugReport());
      reports.push("");
    }
    return reports.join("\n");
  }
}

// Export only the registry class for consumers to instantiate
export { UnifiedIdRegistry };
