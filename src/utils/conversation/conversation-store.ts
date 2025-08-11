/**
 * Represents the context of a conversation session
 */
import { UnifiedIdRegistry, UnifiedIdManager } from "../id-management/unified-id-manager";
// Type for message content
type MessageContent = string | Record<string, unknown>;

// Type for tool call
interface ToolCall {
  id: string;
  name: string;
  arguments?: Record<string, unknown> | string;
}

interface ConversationContext {
  messages: MessageContent[];
  lastToolCalls?: Record<string, ToolCall>;
  lastResponseId?: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

/**
 * Parameters for updating conversation state
 */
export type ConversationUpdate = {
  conversationId: string;
  requestId: string;
  responseId?: string;
};

/**
 * Stores conversation state between API requests.
 * Tracks response IDs and tool call ID mappings for the Claude-to-OpenAI proxy.
 * Automatically removes conversations after 30 minutes of inactivity.
 */
export class ConversationStore {
  private conversations = new Map<string, ConversationContext>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly maxAge = 30 * 60 * 1000; // 30 minutes
  private readonly unifiedIdRegistry = new UnifiedIdRegistry();

  /**
   * Creates a new ConversationStore instance.
   * Initializes automatic cleanup of stale conversations every 5 minutes.
   */
  constructor() {
    // Clean up old conversations every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Gets an existing conversation context or creates a new one.
   * Updates the last accessed timestamp for existing conversations.
   * 
   * @param conversationId - Unique identifier for the conversation
   * @returns The conversation context
   */
  getOrCreate(conversationId: string): ConversationContext {
    const existing = this.conversations.get(conversationId);
    if (existing) {
      existing.lastAccessedAt = new Date();
      return existing;
    }

    const newContext: ConversationContext = {
      messages: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
    this.conversations.set(conversationId, newContext);
    return newContext;
  }

  /**
   * Updates a conversation context with partial data.
   * Creates the conversation if it doesn't exist.
   * 
   * @param conversationId - Unique identifier for the conversation
   * @param updates - Partial updates to apply to the context
   */
  update(conversationId: string, updates: Partial<ConversationContext>) {
    const context = this.getOrCreate(conversationId);
    Object.assign(context, updates);
    context.lastAccessedAt = new Date();
  }

  /**
   * Removes conversations that haven't been accessed within the TTL period.
   * Called automatically every 5 minutes.
   * @private
   */
  private cleanup() {
    const now = Date.now();
    for (const [id, context] of this.conversations.entries()) {
      if (now - context.lastAccessedAt.getTime() > this.maxAge) {
        // Clear associated call_id mappings when conversation is purged by TTL
        this.unifiedIdRegistry.clearManager(id);
        this.conversations.delete(id);
      }
    }
  }

  /**
   * Cleans up resources and stops the cleanup timer.
   * Should be called when shutting down the application.
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    // Clear all associated call_id managers before wiping conversations
    for (const id of this.conversations.keys()) {
      this.unifiedIdRegistry.clearManager(id);
    }
    this.conversations.clear();
  }

  /**
   * Updates conversation state with response details from an API call.
   * Stores response IDs for conversation continuity.
   * 
   * @param params - Update parameters
   * @param params.conversationId - Unique identifier for the conversation
   * @param params.requestId - Current request ID for logging
   * @param params.responseId - OpenAI response ID to store for future requests
   */
  updateConversationState({
    conversationId,
    requestId,
    responseId,
  }: ConversationUpdate): void {
    const updates: Record<string, unknown> = {};

    if (responseId) {
      updates.lastResponseId = responseId;
      console.log(
        `[Request ${requestId}] Stored response ID: ${responseId}`
      );
    }

    if (Object.keys(updates).length > 0) {
      this.update(conversationId, updates);
    }
  }

  /**
   * Retrieves the conversation context for a given conversation ID.
   * Creates a new context if one doesn't exist.
   * 
   * @param conversationId - Unique identifier for the conversation
   * @returns The conversation context containing state and metadata
   */
  getConversationContext(conversationId: string): ConversationContext {
    return this.getOrCreate(conversationId);
  }

  /**
   * Gets the call ID mapping for a conversation from the registry.
   * 
   * @param conversationId - Unique identifier for the conversation
   * @returns The call ID mapping as a Map
   */
  getCallIdMapping(conversationId: string): Map<string, string> {
    const manager = this.unifiedIdRegistry.getManager(conversationId);
    return manager.getMappingAsMap();
  }

  /**
   * Gets the UnifiedIdManager for a specific conversation.
   * 
   * @param conversationId - Unique identifier for the conversation
   * @returns The UnifiedIdManager instance for the conversation
   */
  getIdManager(conversationId: string) {
    return this.unifiedIdRegistry.getManager(conversationId);
  }

  // --- ID management facades (to reduce layer awareness) ---

  /**
   * Register a mapping between OpenAI call_id and Claude tool_use_id for a conversation
   */
  registerIdMapping(
    conversationId: string,
    openaiCallId: string,
    claudeToolUseId: string,
    toolName?: string,
    context?: Record<string, unknown>
  ): void {
    const manager = this.unifiedIdRegistry.getManager(conversationId);
    manager.registerMapping(openaiCallId, claudeToolUseId, toolName, context);
  }

  /**
   * Resolve OpenAI call_id from Claude tool_use_id within a conversation
   */
  getOpenAICallId(conversationId: string, claudeToolUseId: string): string | undefined {
    const manager = this.unifiedIdRegistry.getManager(conversationId);
    return manager.getOpenAICallId(claudeToolUseId);
  }

  /**
   * Resolve Claude tool_use_id from OpenAI call_id within a conversation
   */
  getClaudeToolUseId(conversationId: string, openaiCallId: string): string | undefined {
    const manager = this.unifiedIdRegistry.getManager(conversationId);
    return manager.getClaudeToolUseId(openaiCallId);
  }

  /**
   * Get or allocate an OpenAI call_id for a given Claude tool_use_id within a conversation
   */
  getOrCreateOpenAICallIdForToolUse(
    conversationId: string,
    claudeToolUseId: string,
    toolName?: string,
    context?: Record<string, unknown>
  ): string {
    const manager = this.unifiedIdRegistry.getManager(conversationId);
    return manager.getOrCreateOpenAICallIdForToolUse(claudeToolUseId, toolName, context);
  }
}

/**
 * Singleton instance of the conversation store.
 */
export const conversationStore = new ConversationStore();

// Re-export for single entry point convenience
export { UnifiedIdManager };
