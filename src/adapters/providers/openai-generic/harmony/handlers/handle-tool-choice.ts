/**
 * Handle tool choice parameter
 */

import type { ToolChoice } from '../types';
import { isToolChoiceFunction, isToolChoiceCustom, isToolChoiceAllowed } from '../utils/type-guards';

export function handleToolChoice(toolChoice?: ToolChoice): string | null {
  if (!toolChoice) return null;
  
  // Handle string options
  if (typeof toolChoice === 'string') {
    switch (toolChoice) {
      case 'none':
        return 'Do not use any tools.';
      case 'auto':
        return null; // Default behavior, no special instruction needed
      case 'required':
        return 'You MUST call at least one tool function. Do not respond directly without using tools.';
      default:
        return null;
    }
  }
  
  // Handle object options
  if (typeof toolChoice === 'object') {
    // ToolChoiceAllowed
    if (isToolChoiceAllowed(toolChoice)) {
      if (toolChoice.mode === 'required') {
        if ('tools' in toolChoice && Array.isArray(toolChoice.tools) && toolChoice.tools.length > 0) {
          const toolNames = toolChoice.tools
            .map(t => t.name || t.type)
            .filter(Boolean)
            .join(', ');
          if (toolNames) {
            return `You must use one of these tools: ${toolNames}.`;
          }
        }
        return 'You MUST call at least one tool function. Do not respond directly without using tools.';
      }
      return null; // auto mode is default
    }
    
    // ToolChoiceFunction
    if (isToolChoiceFunction(toolChoice)) {
      if (toolChoice.name) {
        return `You must use the ${toolChoice.name} function.`;
      }
    }
    
    // ToolChoiceCustom
    if (isToolChoiceCustom(toolChoice)) {
      if (toolChoice.name) {
        return `You must use the ${toolChoice.name} tool.`;
      }
    }
  }
  
  return null;
}