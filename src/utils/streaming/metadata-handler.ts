import { logDebug, logInfo } from "../logging/migrate-logger";
import type { LogContext } from "../logging/enhanced-logger";

export interface ConversationMetadata {
  isNewTopic?: boolean;
  title?: string;
  [key: string]: any;
}

/**
 * Handles special metadata responses from OpenAI that may need
 * special processing or forwarding to Claude
 */
export class MetadataHandler {
  private detectedMetadata: ConversationMetadata[] = [];
  
  constructor(private context: LogContext = {}) {}

  /**
   * Check if text content is metadata JSON
   */
  isMetadata(text: string): boolean {
    if (!text) {
      return false;
    }
    
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      return false;
    }
    
    try {
      const parsed = JSON.parse(trimmed);
      // Check for known metadata patterns
      return (
        typeof parsed === "object" &&
        (parsed.isNewTopic !== undefined ||
         parsed.title !== undefined ||
         parsed.conversationTitle !== undefined ||
         parsed.metadata !== undefined)
      );
    } catch {
      return false;
    }
  }

  /**
   * Process metadata and decide what to do with it
   */
  processMetadata(text: string, itemId?: string): {
    shouldForward: boolean;
    metadata?: ConversationMetadata;
    processedText?: string;
  } {
    try {
      const metadata = JSON.parse(text.trim()) as ConversationMetadata;
      this.detectedMetadata.push(metadata);
      
      logInfo(
        "Conversation metadata detected",
        { metadata, itemId },
        this.context
      );
      
      // Analyze the metadata type
      if (metadata.isNewTopic !== undefined && metadata.title !== undefined) {
        // This is Claude's conversation title metadata
        // In Claude's UI, this would update the conversation title
        // For API usage, we might want to:
        // 1. Store it for reference
        // 2. Optionally include it as a system message
        // 3. Or skip it entirely
        
        logDebug(
          "Claude conversation title metadata",
          {
            isNewTopic: metadata.isNewTopic,
            title: metadata.title,
            decision: "skip_forwarding",
          },
          this.context
        );
        
        // For now, don't forward this to the Claude API client
        // as it's UI metadata, not conversation content
        return {
          shouldForward: false,
          metadata,
        };
      }
      
      // For other metadata types, decide based on content
      if (metadata.metadata || metadata.system) {
        // System metadata might be important
        logDebug(
          "System metadata detected",
          { metadata, decision: "forward_as_system" },
          this.context
        );
        
        // Could convert to a system message if needed
        return {
          shouldForward: false, // Don't forward as-is
          metadata,
          processedText: undefined, // Could create a system message here
        };
      }
      
      // Unknown metadata pattern - log for analysis
      logDebug(
        "Unknown metadata pattern",
        { metadata, decision: "skip_forwarding" },
        this.context
      );
      
      return {
        shouldForward: false,
        metadata,
      };
    } catch (error) {
      // Not valid JSON or processing error
      logDebug(
        "Failed to process metadata",
        { text, error: error instanceof Error ? error.message : error },
        this.context
      );
      
      // If we can't parse it, treat it as normal text
      return {
        shouldForward: true,
      };
    }
  }

  /**
   * Get all detected metadata
   */
  getDetectedMetadata(): ConversationMetadata[] {
    return this.detectedMetadata;
  }

  /**
   * Get the latest conversation title if detected
   */
  getConversationTitle(): string | undefined {
    for (let i = this.detectedMetadata.length - 1; i >= 0; i--) {
      const meta = this.detectedMetadata[i];
      if (meta.title) {
        return meta.title;
      }
    }
    return undefined;
  }

  /**
   * Clear metadata for new conversation
   */
  reset(): void {
    this.detectedMetadata = [];
  }
}

// Singleton instances per conversation
const handlers = new Map<string, MetadataHandler>();

/**
 * Get or create metadata handler for a conversation
 */
export function getMetadataHandler(conversationId: string, context?: LogContext): MetadataHandler {
  if (!handlers.has(conversationId)) {
    handlers.set(conversationId, new MetadataHandler({ ...context, conversationId }));
  }
  return handlers.get(conversationId)!;
}

/**
 * Clean up handler for a conversation
 */
export function cleanupMetadataHandler(conversationId: string): void {
  handlers.delete(conversationId);
}
