import { describe, it, expect } from 'vitest';
import { extractChatCompletionParams } from './extract-chat-params';
import type { ResponseCreateParamsBase } from '../types';

describe('extractChatCompletionParams', () => {
  it('should return empty object for empty params', () => {
    const params: ResponseCreateParamsBase = {};
    expect(extractChatCompletionParams(params)).toEqual({});
  });

  it('should map model', () => {
    const params: ResponseCreateParamsBase = { model: 'gpt-4' };
    const result = extractChatCompletionParams(params);
    expect(result.model).toBe('gpt-4');
  });

  it('should map temperature', () => {
    const params: ResponseCreateParamsBase = { temperature: 0.7 };
    const result = extractChatCompletionParams(params);
    expect(result.temperature).toBe(0.7);
  });

  it('should map top_p', () => {
    const params: ResponseCreateParamsBase = { top_p: 0.9 };
    const result = extractChatCompletionParams(params);
    expect(result.top_p).toBe(0.9);
  });

  it('should map max_output_tokens to max_tokens', () => {
    const params: ResponseCreateParamsBase = { max_output_tokens: 1000 };
    const result = extractChatCompletionParams(params);
    expect(result.max_tokens).toBe(1000);
    expect(result).not.toHaveProperty('max_output_tokens');
  });

  it('should map stream', () => {
    const params: ResponseCreateParamsBase = { stream: true };
    const result = extractChatCompletionParams(params);
    expect(result.stream).toBe(true);
  });

  it('should map stream_options', () => {
    const streamOptions = { include_obfuscation: false };
    const params: ResponseCreateParamsBase = { stream_options: streamOptions };
    const result = extractChatCompletionParams(params);
    expect(result.stream_options).toEqual(streamOptions);
  });

  it('should handle null values', () => {
    const params: ResponseCreateParamsBase = {
      temperature: null,
      top_p: null,
      max_output_tokens: null,
      stream: null
    };
    const result = extractChatCompletionParams(params);
    expect(result).toEqual({});
  });

  it('should map multiple parameters', () => {
    const params: ResponseCreateParamsBase = {
      model: 'gpt-4',
      temperature: 0.5,
      top_p: 0.8,
      max_output_tokens: 500,
      stream: false
    };
    const result = extractChatCompletionParams(params);
    expect(result).toEqual({
      model: 'gpt-4',
      temperature: 0.5,
      top_p: 0.8,
      max_tokens: 500,
      stream: false
    });
  });

  it('should ignore non-mappable params', () => {
    const params: ResponseCreateParamsBase = {
      model: 'gpt-4',
      background: true,
      include: ['file_search_call.results'],
      instructions: 'Be helpful',
      reasoning: { effort: 'high' },
      tools: [],
      metadata: { key: 'value' }
    };
    const result = extractChatCompletionParams(params);
    expect(result).toEqual({ model: 'gpt-4' });
    expect(result).not.toHaveProperty('background');
    expect(result).not.toHaveProperty('include');
    expect(result).not.toHaveProperty('instructions');
    expect(result).not.toHaveProperty('reasoning');
    expect(result).not.toHaveProperty('tools');
    expect(result).not.toHaveProperty('metadata');
  });
});