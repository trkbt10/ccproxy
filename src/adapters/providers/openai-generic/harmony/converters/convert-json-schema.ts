/**
 * Convert JSON Schema to TypeScript-like syntax for Harmony
 */

export function convertJsonSchemaToTypeScript(schema: any, indent: string = ''): string {
  if (!schema) return 'unknown';

  switch (schema.type) {
    case 'string':
      if (schema.enum) {
        return schema.enum.map((v: string) => `"${v}"`).join(' | ');
      }
      return 'string';
    
    case 'number':
    case 'integer':
      return 'number';
    
    case 'boolean':
      return 'boolean';
    
    case 'null':
      return 'null';
    
    case 'array':
      if (schema.items) {
        const itemType = convertJsonSchemaToTypeScript(schema.items, indent);
        return `${itemType}[]`;
      }
      return 'unknown[]';
    
    case 'object':
      if (schema.properties) {
        const props = Object.entries(schema.properties)
          .map(([key, propSchema]: [string, any]) => {
            const required = schema.required?.includes(key);
            const optional = required ? '' : '?';
            const description = propSchema.description;
            const type = convertJsonSchemaToTypeScript(propSchema, indent + '  ');
            
            let result = '';
            if (description) {
              result += `${indent}// ${description}\n`;
            }
            
            // Handle enum with default
            if (propSchema.enum && propSchema.default) {
              result += `${indent}${key}${optional}: ${type}, // default: ${propSchema.default}`;
            } else {
              result += `${indent}${key}${optional}: ${type},`;
            }
            
            return result;
          })
          .join('\n');
        
        return `{\n${props}\n${indent.slice(2)}}`;
      }
      return 'Record<string, unknown>';
    
    default:
      // Handle union types
      if (schema.anyOf || schema.oneOf) {
        const types = (schema.anyOf || schema.oneOf)
          .map((s: any) => convertJsonSchemaToTypeScript(s, indent))
          .join(' | ');
        return types;
      }
      
      return 'unknown';
  }
}