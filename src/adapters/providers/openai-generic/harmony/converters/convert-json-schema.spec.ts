import { describe, it, expect } from 'vitest';
import { convertJsonSchemaToTypeScript } from './convert-json-schema';

describe('convertJsonSchemaToTypeScript', () => {
  it('should convert string type', () => {
    expect(convertJsonSchemaToTypeScript({ type: 'string' })).toBe('string');
  });

  it('should convert string enum', () => {
    const schema = { 
      type: 'string', 
      enum: ['celsius', 'fahrenheit'] 
    };
    expect(convertJsonSchemaToTypeScript(schema)).toBe('"celsius" | "fahrenheit"');
  });

  it('should convert number type', () => {
    expect(convertJsonSchemaToTypeScript({ type: 'number' })).toBe('number');
    expect(convertJsonSchemaToTypeScript({ type: 'integer' })).toBe('number');
  });

  it('should convert boolean type', () => {
    expect(convertJsonSchemaToTypeScript({ type: 'boolean' })).toBe('boolean');
  });

  it('should convert null type', () => {
    expect(convertJsonSchemaToTypeScript({ type: 'null' })).toBe('null');
  });

  it('should convert array type', () => {
    expect(convertJsonSchemaToTypeScript({ 
      type: 'array',
      items: { type: 'string' }
    })).toBe('string[]');
  });

  it('should convert array without items', () => {
    expect(convertJsonSchemaToTypeScript({ type: 'array' })).toBe('unknown[]');
  });

  it('should convert object with properties', () => {
    const schema = {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'The city and state' },
        format: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
      },
      required: ['location']
    };
    
    const result = convertJsonSchemaToTypeScript(schema);
    expect(result).toContain('// The city and state');
    expect(result).toContain('location: string,');
    expect(result).toContain('format?: "celsius" | "fahrenheit", // default: celsius');
  });

  it('should handle nested objects', () => {
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        }
      }
    };
    
    const result = convertJsonSchemaToTypeScript(schema);
    expect(result).toContain('user?: {');
    expect(result).toContain('name?: string,');
    expect(result).toContain('age?: number,');
  });

  it('should handle anyOf/oneOf unions', () => {
    const schema = {
      anyOf: [
        { type: 'string' },
        { type: 'number' }
      ]
    };
    
    expect(convertJsonSchemaToTypeScript(schema)).toBe('string | number');
  });

  it('should handle unknown schemas', () => {
    expect(convertJsonSchemaToTypeScript(null)).toBe('unknown');
    expect(convertJsonSchemaToTypeScript({})).toBe('unknown');
  });
});