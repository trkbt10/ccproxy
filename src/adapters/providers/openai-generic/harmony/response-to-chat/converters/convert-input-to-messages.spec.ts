import { describe, it, expect } from 'vitest';
import { convertInputToMessages } from './convert-input-to-messages';
import type { ResponseInput } from '../../types';
import { 
  createMessageInput, 
  createTextInput,
  createFunctionCallInput,
  createFunctionCallOutput,
  createTextContentPart,
  createImageContentPart
} from '../../fixtures.test.support';

describe('convertInputToMessages', () => {
  it('should return empty array for no input', () => {
    expect(convertInputToMessages()).toEqual([]);
    expect(convertInputToMessages(undefined)).toEqual([]);
  });

  it('should convert string input to user message', () => {
    const result = convertInputToMessages('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('<|start|>user<|message|>Hello world<|end|>');
  });

  it('should return empty array for non-array non-string input', () => {
    // Testing edge cases where input is neither string nor array
    // @ts-ignore - Testing runtime handling of invalid input types (object and number)
    // The function should gracefully handle non-array/non-string inputs and return empty array
    expect(convertInputToMessages({})).toEqual([]);
    // @ts-ignore - Testing runtime handling of invalid input type (number)
    expect(convertInputToMessages(123)).toEqual([]);
  });

  it('should convert message items from array', () => {
    const input: ResponseInput = [
      createMessageInput('user', 'What is the weather?')
    ];
    
    const result = convertInputToMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('What is the weather?');
  });

  it('should handle different roles correctly', () => {
    const input: ResponseInput = [
      createMessageInput('system', 'System message'),
      createMessageInput('developer', 'Developer message'),
      createMessageInput('user', 'User message'),
      createMessageInput('assistant', 'Assistant message')
    ];
    
    const result = convertInputToMessages(input);
    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('system'); // developer maps to system
    expect(result[2].role).toBe('user');
    expect(result[3].role).toBe('assistant');
  });

  it('should handle array content in messages', () => {
    const input: ResponseInput = [
      createMessageInput('user', [
        createTextContentPart('Part 1'),
        createTextContentPart('Part 2'),
        createImageContentPart('image.jpg') // Should be filtered out
      ])
    ];
    
    const result = convertInputToMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('Part 1\nPart 2');
  });

  it('should skip tool call items', () => {
    const input: ResponseInput = [
      createMessageInput('user', 'Hello'),
      createFunctionCallInput('test_func'),
      createFunctionCallOutput('result')
    ];
    
    const result = convertInputToMessages(input);
    expect(result).toHaveLength(1); // Only the message
    expect(result[0].content).toContain('Hello');
  });

  // Note: input_text items are not part of ResponseInputItem in OpenAI's types
  // They are handled separately in the ResponseInput structure

  it('should skip invalid items', () => {
    const input: ResponseInput = [
      // These will be skipped because they're not objects
      // @ts-ignore - Testing that null items in the array are properly filtered out
      // The converter should skip non-object items and only process valid ResponseInputItem objects
      null,
      // @ts-ignore - Testing that undefined items are filtered out
      undefined,
      // @ts-ignore - Testing that string primitives are filtered out
      'string',
      // @ts-ignore - Testing that number primitives are filtered out
      123,
      createMessageInput('user', 'Valid message')
    ];
    
    const result = convertInputToMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('Valid message');
  });

  it('should handle messages with empty content', () => {
    const input: ResponseInput = [
      createMessageInput('user', ''),
      createMessageInput('user', []), // Empty array content
      // Message without content field cannot be created with our factory
      // because content is required. This is correct behavior.
    ];
    
    const result = convertInputToMessages(input);
    expect(result).toHaveLength(2); // Both messages with empty content
    result.forEach(msg => {
      expect(msg.content).toContain('<|message|><|end|>'); // Empty content
    });
  });
});