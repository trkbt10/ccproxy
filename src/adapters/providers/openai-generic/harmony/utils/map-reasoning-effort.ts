/**
 * Map OpenAI reasoning effort to Harmony format
 */

import type { Reasoning } from '../types';
import { REASONING_LEVELS } from '../constants';
import type { ReasoningLevel } from '../constants';

export function mapReasoningEffort(reasoning?: Reasoning | null): ReasoningLevel {
  if (!reasoning?.effort) {
    return REASONING_LEVELS.MEDIUM; // default
  }

  // Map OpenAI reasoning efforts to Harmony format
  switch (reasoning.effort) {
    case 'high':
      return REASONING_LEVELS.HIGH;
    case 'medium':
      return REASONING_LEVELS.MEDIUM;
    case 'low':
    case 'minimal':
      return REASONING_LEVELS.LOW;
    default:
      return REASONING_LEVELS.MEDIUM;
  }
}