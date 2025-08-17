import { describe, it, expect, vi } from 'vitest';
import { handleConversationState, processAssistantMessage } from './handle-conversation-state';
import type { ResponseCreateParamsBase } from '../types';

describe('handleConversationState', () => {
  it('should return empty array when no input', () => {
    const params: ResponseCreateParamsBase = {};
    expect(handleConversationState(params)).toEqual([]);
  });

  it('should convert string input to messages', () => {
    const params: ResponseCreateParamsBase = {
      input: 'Hello world'
    };
    const result = handleConversationState(params);
    
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('Hello world');
  });

  it('should convert array input to messages', () => {
    const params: ResponseCreateParamsBase = {
      input: [
        // @ts-ignore - Testing runtime handling of message input with required 'type' field
        // The OpenAI ResponseInputItem type is a union that includes EasyInputMessage which doesn't require 'type',
        // but we're explicitly testing the Message variant which does require 'type' field
        { type: 'message', role: 'user', content: 'Question' },
        // @ts-ignore - Same as above: testing Message variant with explicit 'type' field
        { type: 'message', role: 'assistant', content: 'Answer' }
      ]
    };
    const result = handleConversationState(params);
    
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('Question');
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toContain('Answer');
  });

  it('should warn about previous_response_id', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const params: ResponseCreateParamsBase = {
      previous_response_id: 'resp_123',
      input: 'Test'
    };
    const result = handleConversationState(params);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      'Previous response ID resp_123 needs to be fetched and processed'
    );
    expect(result).toHaveLength(1); // Still processes input
    
    consoleSpy.mockRestore();
  });

  it('should handle both previous_response_id and input', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const params: ResponseCreateParamsBase = {
      previous_response_id: 'resp_456',
      input: [
        // @ts-ignore - Testing runtime handling of message input with required 'type' field
        // Same as above: testing Message variant of ResponseInputItem union type
        { type: 'message', role: 'user', content: 'New question' }
      ]
    };
    const result = handleConversationState(params);
    
    expect(consoleSpy).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('New question');
    
    consoleSpy.mockRestore();
  });
});

describe('processAssistantMessage', () => {
  it('should replace <|return|> with <|end|>', () => {
    const content = '<|start|>assistant<|channel|>final<|message|>Answer<|return|>';
    const result = processAssistantMessage(content, false);
    
    expect(result).toBe('<|start|>assistant<|channel|>final<|message|>Answer<|end|>');
  });

  it('should not modify messages without <|return|>', () => {
    const content = '<|start|>assistant<|channel|>final<|message|>Answer<|end|>';
    const result = processAssistantMessage(content, false);
    
    expect(result).toBe(content);
  });

  it('should keep content when tool calls present', () => {
    const content = '<|start|>assistant<|channel|>analysis<|message|>Thinking...<|end|>';
    const result = processAssistantMessage(content, true);
    
    expect(result).toBe(content);
  });

  it('should handle empty content', () => {
    expect(processAssistantMessage('', false)).toBe('');
  });

  it('should only replace <|return|> at the end', () => {
    const content = 'Some <|return|> in middle<|return|>';
    const result = processAssistantMessage(content, false);
    
    expect(result).toBe('Some <|return|> in middle<|end|>');
  });
});