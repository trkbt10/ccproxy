import { UnifiedIdManager } from "./unified-id-manager";

/**
 * Ensures we have a valid UnifiedIdManager instance
 * Creates a new instance if null/undefined is passed
 */
export function ensureCallIdManager(
  callIdManager: UnifiedIdManager | null | undefined
): UnifiedIdManager {
  // If already a UnifiedIdManager, return it
  if (callIdManager instanceof UnifiedIdManager) {
    return callIdManager;
  }

  // Create new manager for null/undefined cases
  return new UnifiedIdManager();
}
