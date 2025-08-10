import { UnifiedIdManager } from "./unified-id-manager";
import type { MappingContext } from "./unified-id-manager";

/**
 * Ensures we have a valid UnifiedIdManager instance
 * Handles legacy Map conversion and null/undefined cases
 */
export function ensureCallIdManager(
  callIdManager: UnifiedIdManager | Map<string, string> | null | undefined,
  context?: MappingContext
): UnifiedIdManager {
  // If already a UnifiedIdManager, return it
  if (callIdManager instanceof UnifiedIdManager) {
    return callIdManager;
  }

  // Create new manager
  const manager = new UnifiedIdManager();

  // If it's a legacy Map, import the mappings
  if (callIdManager instanceof Map) {
    manager.importFromMap(
      callIdManager,
      context || { source: "legacy-map-conversion" }
    );
  }

  return manager;
}
