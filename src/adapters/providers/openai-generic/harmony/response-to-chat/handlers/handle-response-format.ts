/**
 * Handle response format for structured outputs
 */

import type { ResponseTextConfig } from '../../types';
import { hasResponseFormat } from '../../utils/type-guards';

export function handleResponseFormat(text?: ResponseTextConfig): string | null {
  if (!text) return null;
  
  // Check if text config has response_format or structured output schema
  if (!hasResponseFormat(text)) return null;
  
  const { name, description, schema } = text.response_format.json_schema;
  
  if (!name || !schema) return null;
  
  // Format according to Harmony spec
  let result = `# Response Formats\n\n## ${name}\n\n`;
  
  if (description) {
    result += `// ${description}\n`;
  }
  
  // Add the JSON schema directly (Harmony expects raw JSON schema)
  result += JSON.stringify(schema);
  
  return result;
}