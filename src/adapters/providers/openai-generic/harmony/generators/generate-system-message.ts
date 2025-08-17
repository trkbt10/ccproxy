/**
 * Generate Harmony system message
 */

import type { ResponseCreateParamsBase } from '../types';
import { HARMONY_ROLES, FUNCTION_NAMESPACE } from '../constants';
import { formatCurrentDate } from '../utils/format-current-date';
import { mapReasoningEffort } from '../utils/map-reasoning-effort';
import { formatHarmonyMessage } from '../utils/format-harmony-message';
import { getBuiltinToolTypes } from '../converters/convert-tools';

export function generateSystemMessage(
  params: ResponseCreateParamsBase,
  knowledgeCutoff: string = '2024-06'
): string {
  // Build system message content
  const lines: string[] = [
    'You are ChatGPT, a large language model trained by OpenAI.',
    `Knowledge cutoff: ${knowledgeCutoff}`,
    `Current date: ${formatCurrentDate()}`,
    '',
    `Reasoning: ${mapReasoningEffort(params.reasoning)}`,
    ''
  ];

  // Check if we have tools
  const hasTools = params.tools && params.tools.length > 0;
  const hasFunctionTools = hasTools && params.tools!.some(t => t.type === 'function');
  const builtinTools = hasTools ? getBuiltinToolTypes(params.tools!) : [];

  // Add built-in tools section if needed
  if (builtinTools.length > 0) {
    lines.push('# Tools');
    lines.push('');
    
    if (builtinTools.includes('browser')) {
      lines.push(...getBrowserToolDefinition());
      lines.push('');
    }
    
    if (builtinTools.includes('python')) {
      lines.push(...getPythonToolDefinition());
      lines.push('');
    }
  }

  // Add channel information
  lines.push('# Valid channels: analysis, commentary, final. Channel must be included for every message.');
  
  // Add tool channel routing if function tools present
  if (hasFunctionTools) {
    lines.push(`Calls to these tools must go to the commentary channel: '${FUNCTION_NAMESPACE}'.`);
  }

  const content = lines.join('\n');
  
  // Format as Harmony message
  return formatHarmonyMessage({
    role: HARMONY_ROLES.SYSTEM,
    content
  });
}

function getBrowserToolDefinition(): string[] {
  return [
    '## browser',
    '',
    '// Tool for browsing.',
    '// The `cursor` appears in brackets before each browsing display: `[{cursor}]`.',
    '// Cite information from the tool using the following format:',
    '// `【{cursor}†L{line_start}(-L{line_end})?】`, for example: `【6†L9-L11】` or `【8†L3】`.',
    '// Do not quote more than 10 words directly from the tool output.',
    '// sources=web (default: web)',
    'namespace browser {',
    '',
    '// Searches for information related to `query` and displays `topn` results.',
    'type search = (_: {',
    'query: string,',
    'topn?: number, // default: 10',
    'source?: string,',
    '}) => any;',
    '',
    '// Opens the link `id` from the page indicated by `cursor` starting at line number `loc`, showing `num_lines` lines.',
    '// Valid link ids are displayed with the formatting: `【{id}†.*】`.',
    '// If `cursor` is not provided, the most recent page is implied.',
    '// If `id` is a string, it is treated as a fully qualified URL associated with `source`.',
    '// If `loc` is not provided, the viewport will be positioned at the beginning of the document or centered on the most relevant passage, if available.',
    '// Use this function without `id` to scroll to a new location of an opened page.',
    'type open = (_: {',
    'id?: number | string, // default: -1',
    'cursor?: number, // default: -1',
    'loc?: number, // default: -1',
    'num_lines?: number, // default: -1',
    'view_source?: boolean, // default: false',
    'source?: string,',
    '}) => any;',
    '',
    '// Finds exact matches of `pattern` in the current page, or the page given by `cursor`.',
    'type find = (_: {',
    'pattern: string,',
    'cursor?: number, // default: -1',
    '}) => any;',
    '',
    '} // namespace browser'
  ];
}

function getPythonToolDefinition(): string[] {
  return [
    '## python',
    '',
    'Use this tool to execute Python code in your chain of thought. The code will not be shown to the user. This tool should be used for internal reasoning, but not for code that is intended to be visible to the user (e.g. when creating plots, tables, or files).',
    '',
    "When you send a message containing Python code to python, it will be executed in a stateful Jupyter notebook environment. python will respond with the output of the execution or time out after 120.0 seconds. The drive at '/mnt/data' can be used to save and persist user files. Internet access for this session is UNKNOWN. Depends on the cluster."
  ];
}