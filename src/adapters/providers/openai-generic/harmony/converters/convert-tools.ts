/**
 * Convert OpenAI tools to Harmony TypeScript-like format
 */

import type { Tool } from '../types';
import { convertJsonSchemaToTypeScript } from './convert-json-schema';
import { 
  isFunctionTool, 
  isBuiltinTool,
  isWebSearchTool,
  isCodeInterpreterTool
} from '../utils/type-guards';

export function convertToolsToHarmonyFormat(tools: Tool[]): string {
  if (!tools || tools.length === 0) return '';

  // Separate function tools from built-in tools
  const functionTools = tools.filter(isFunctionTool);
  const builtinTools = tools.filter(isBuiltinTool);
  
  let result = '';
  
  // Add function tools namespace
  if (functionTools.length > 0) {
    result += '## functions\n\nnamespace functions {\n\n';
    
    for (const tool of functionTools) {
      const description = tool.description || 'No description provided';
      const params = tool.parameters;
      
      // Add description as comment
      result += `// ${description}\n`;
      
      // Format function type
      if (!params || Object.keys(params).length === 0) {
        result += `type ${tool.name} = () => any;\n\n`;
      } else {
        const paramsType = convertJsonSchemaToTypeScript(params, '');
        result += `type ${tool.name} = (_: ${paramsType}) => any;\n\n`;
      }
    }
    
    result += '} // namespace functions';
  }
  
  // Note: Built-in tools like browser and python are handled separately in system message
  // Here we just track which ones are present
  const hasWebSearch = builtinTools.some(isWebSearchTool);
  const hasCodeInterpreter = builtinTools.some(isCodeInterpreterTool);
  
  // Return the formatted tools and a flag for built-in tools
  return result;
}

export function getBuiltinToolTypes(tools: Tool[]): Array<'browser' | 'python'> {
  const builtinTypes: Array<'browser' | 'python'> = [];
  
  if (tools.some(isWebSearchTool)) {
    builtinTypes.push('browser');
  }
  
  if (tools.some(isCodeInterpreterTool)) {
    builtinTypes.push('python');
  }
  
  return builtinTypes;
}