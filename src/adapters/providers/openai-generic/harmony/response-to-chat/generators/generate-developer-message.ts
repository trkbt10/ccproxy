/**
 * Generate Harmony developer message
 */

import type { ResponseCreateParamsBase } from '../../types';
import { HARMONY_ROLES } from '../../constants';
import { formatHarmonyMessage } from '../../utils/format-harmony-message';
import { convertToolsToHarmonyFormat } from '../converters/convert-tools';
import { handleResponseFormat } from '../handlers/handle-response-format';
import { handleToolChoice } from '../handlers/handle-tool-choice';

export function generateDeveloperMessage(params: ResponseCreateParamsBase): string | null {
  const sections: string[] = [];
  
  // Add instructions if present
  if (params.instructions) {
    sections.push('# Instructions');
    sections.push('');
    sections.push(params.instructions);
  }
  
  // Add tool choice instructions if needed
  const toolChoiceInstructions = handleToolChoice(params.tool_choice);
  if (toolChoiceInstructions) {
    if (sections.length === 0) {
      sections.push('# Instructions');
      sections.push('');
    } else if (sections[sections.length - 1] !== '') {
      sections.push('');
    }
    sections.push(toolChoiceInstructions);
  }
  
  // Add tools if present
  if (params.tools && params.tools.length > 0) {
    const toolsFormat = convertToolsToHarmonyFormat(params.tools);
    if (toolsFormat) {
      if (sections.length > 0) sections.push('');
      sections.push('# Tools');
      sections.push('');
      sections.push(toolsFormat);
    }
  }
  
  // Add response format if present
  const responseFormat = handleResponseFormat(params.text);
  if (responseFormat) {
    if (sections.length > 0) sections.push('');
    sections.push(responseFormat);
  }
  
  // If no content, return null
  if (sections.length === 0) {
    return null;
  }
  
  const content = sections.join('\n');
  
  // Format as Harmony message
  return formatHarmonyMessage({
    role: HARMONY_ROLES.DEVELOPER,
    content
  });
}