/**
 * Represents the context of a conversation session
 */
// Deprecated: external ID manager removed; conversions are deterministic now
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
  // No external ID registry required

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
  updateConversationState({ conversationId, requestId, responseId }: ConversationUpdate): void {
    const updates: Record<string, unknown> = {};

    if (responseId) {
      updates.lastResponseId = responseId;
      console.log(`[Request ${requestId}] Stored response ID: ${responseId}`);
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
  // getCallIdMapping removed — no longer needed

  /**
   * Gets the UnifiedIdManager for a specific conversation.
   *
   * @param conversationId - Unique identifier for the conversation
   * @returns The UnifiedIdManager instance for the conversation
   */
  // getIdManager removed — deterministic conversion obviates mapping

  // --- ID management facades (to reduce layer awareness) ---

  /**
   * Register a mapping between OpenAI call_id and Claude tool_use_id for a conversation
   */
  // registerIdMapping removed — conversions are deterministic

  /**
   * Resolve OpenAI call_id from Claude tool_use_id within a conversation
   */
  // getOpenAICallId removed

  /**
   * Resolve Claude tool_use_id from OpenAI call_id within a conversation
   */
  // getClaudeToolUseId removed

  /**
   * Get or allocate an OpenAI call_id for a given Claude tool_use_id within a conversation
   */
  // getOrCreateOpenAICallIdForToolUse removed
}

// No module-level singleton; instantiate and pass where needed
