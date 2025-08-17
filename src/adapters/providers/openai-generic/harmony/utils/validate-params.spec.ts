import { describe, it, expect } from 'vitest';
import { validateParams, ValidationError } from './validate-params';
import type { ResponseCreateParamsBase, Tool } from '../types';
import { createInvalidParams, createFunctionTool, createInvalidFunctionTool } from '../test-fixtures';

describe('validateParams', () => {
  it('should throw when params are not provided', () => {
    // We need to test invalid inputs (null/undefined) which TypeScript correctly prevents
    // at compile time. Using 'as unknown as' here is justified for testing error handling.
    expect(() => validateParams(null as unknown as ResponseCreateParamsBase)).toThrow(ValidationError);
    expect(() => validateParams(undefined as unknown as ResponseCreateParamsBase)).toThrow('Response parameters are required');
  });

  it('should pass with minimal valid params', () => {
    const params: ResponseCreateParamsBase = {};
    expect(() => validateParams(params)).not.toThrow();
  });

  it('should validate model type', () => {
    // Testing runtime validation of incorrect type (number instead of string)
    const invalidParams = createInvalidParams({ model: 123 as unknown as string });
    expect(() => validateParams(invalidParams as ResponseCreateParamsBase)).toThrow('Model must be a string');
    
    const validParams: ResponseCreateParamsBase = { model: 'gpt-4' };
    expect(() => validateParams(validParams)).not.toThrow();
  });

  it('should validate input type', () => {
    // Testing runtime validation of incorrect type (number instead of string/array)
    const invalidParams = createInvalidParams({ input: 123 as unknown as string });
    expect(() => validateParams(invalidParams as ResponseCreateParamsBase)).toThrow('Input must be a string or array');
    
    const validString: ResponseCreateParamsBase = { input: 'test' };
    expect(() => validateParams(validString)).not.toThrow();
    
    const validArray: ResponseCreateParamsBase = { input: [] };
    expect(() => validateParams(validArray)).not.toThrow();
  });

  it('should validate instructions type', () => {
    // Testing runtime validation of incorrect type (number instead of string)
    const invalidParams = createInvalidParams({ instructions: 123 as unknown as string });
    expect(() => validateParams(invalidParams as ResponseCreateParamsBase)).toThrow('Instructions must be a string');
    
    const validParams: ResponseCreateParamsBase = { instructions: 'Do this' };
    expect(() => validateParams(validParams)).not.toThrow();
    
    const nullParams: ResponseCreateParamsBase = { instructions: null };
    expect(() => validateParams(nullParams)).not.toThrow();
  });

  it('should validate tools array', () => {
    // Testing runtime validation - string instead of array
    // @ts-ignore - Testing runtime validation with intentionally wrong type (string instead of array)
    // This ensures the validator properly handles invalid input types at runtime
    const invalidParams = createInvalidParams({ tools: 'not-array' });
    expect(() => validateParams(invalidParams as ResponseCreateParamsBase)).toThrow('Tools must be an array');
    
    // Testing runtime validation - array containing null instead of tool objects
    // @ts-ignore - Testing runtime validation with array containing null instead of tool objects
    // This ensures the validator checks each array element is a valid tool object
    const invalidToolParams = createInvalidParams({ tools: [null] });
    expect(() => validateParams(invalidToolParams as ResponseCreateParamsBase)).toThrow('Each tool must be an object');
    
    const validParams: ResponseCreateParamsBase = { tools: [] };
    expect(() => validateParams(validParams)).not.toThrow();
  });

  it('should validate function tool structure', () => {
    // Create a function tool without name - using helper to create malformed tool
    const invalidTool = createInvalidFunctionTool({
      description: 'test',
      parameters: {},
      strict: null
    });
    // Cast required because we're intentionally creating an invalid tool structure
    const invalidParams: ResponseCreateParamsBase = { 
      tools: [invalidTool as Tool] 
    };
    expect(() => validateParams(invalidParams)).toThrow('Function tool must have a name');
    
    const validParams: ResponseCreateParamsBase = { 
      tools: [createFunctionTool({ name: 'test_func' })] 
    };
    expect(() => validateParams(validParams)).not.toThrow();
  });

  it('should validate temperature range', () => {
    const tooLow = createInvalidParams({ temperature: -1 });
    expect(() => validateParams(tooLow as ResponseCreateParamsBase)).toThrow('Temperature must be a number between 0 and 2');
    
    const tooHigh = createInvalidParams({ temperature: 3 });
    expect(() => validateParams(tooHigh as ResponseCreateParamsBase)).toThrow('Temperature must be a number between 0 and 2');
    
    // Testing runtime validation - string instead of number
    const notNumber = createInvalidParams({ temperature: '1' as unknown as number });
    expect(() => validateParams(notNumber as ResponseCreateParamsBase)).toThrow('Temperature must be a number between 0 and 2');
    
    const valid: ResponseCreateParamsBase = { temperature: 0.7 };
    expect(() => validateParams(valid)).not.toThrow();
  });

  it('should validate top_p range', () => {
    const tooLow = createInvalidParams({ top_p: -0.1 });
    expect(() => validateParams(tooLow as ResponseCreateParamsBase)).toThrow('top_p must be a number between 0 and 1');
    
    const tooHigh = createInvalidParams({ top_p: 1.1 });
    expect(() => validateParams(tooHigh as ResponseCreateParamsBase)).toThrow('top_p must be a number between 0 and 1');
    
    const valid: ResponseCreateParamsBase = { top_p: 0.9 };
    expect(() => validateParams(valid)).not.toThrow();
  });

  it('should validate max_output_tokens', () => {
    const negative = createInvalidParams({ max_output_tokens: -100 });
    expect(() => validateParams(negative as ResponseCreateParamsBase)).toThrow('max_output_tokens must be a positive number');
    
    const zero = createInvalidParams({ max_output_tokens: 0 });
    expect(() => validateParams(zero as ResponseCreateParamsBase)).toThrow('max_output_tokens must be a positive number');
    
    const valid: ResponseCreateParamsBase = { max_output_tokens: 1000 };
    expect(() => validateParams(valid)).not.toThrow();
  });

  it('should validate reasoning type', () => {
    // Testing runtime validation - string instead of object
    // @ts-ignore - Testing runtime validation with string instead of Reasoning object
    // Reasoning should be an object with 'effort' property, not a string
    const invalidParams = createInvalidParams({ reasoning: 'high' });
    expect(() => validateParams(invalidParams as ResponseCreateParamsBase)).toThrow('Reasoning must be an object');
    
    const validParams: ResponseCreateParamsBase = { reasoning: { effort: 'high' } };
    expect(() => validateParams(validParams)).not.toThrow();
  });
});