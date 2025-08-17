import { describe, it, expect } from 'vitest';
import {
  parseToolRecipient,
  formatToolCallMessage,
  formatToolResponse,
  isToolCallMessage,
  extractToolInfoFromMessage
} from './tool-message-utils';
import { HARMONY_CHANNELS, CONSTRAINT_TYPES } from '../constants';

describe('parseToolRecipient', () => {
  it('should parse function tool recipient', () => {
    const result = parseToolRecipient('functions.get_weather');
    
    expect(result).toEqual({
      toolName: 'functions.get_weather',
      namespace: 'functions',
      functionName: 'get_weather',
      channel: HARMONY_CHANNELS.COMMENTARY,
      constraintType: CONSTRAINT_TYPES.JSON
    });
  });

  it('should parse browser tool recipient', () => {
    const result = parseToolRecipient('browser.search');
    
    expect(result).toEqual({
      toolName: 'browser.search',
      namespace: 'browser',
      functionName: 'search',
      channel: HARMONY_CHANNELS.ANALYSIS,
      constraintType: undefined
    });
  });

  it('should parse python tool recipient', () => {
    const result = parseToolRecipient('python');
    
    expect(result).toBeNull(); // Python is just 'python', not 'python.something'
  });

  it('should return null for invalid recipient', () => {
    expect(parseToolRecipient('invalid')).toBeNull();
    expect(parseToolRecipient('too.many.parts')).toBeNull();
  });
});

describe('formatToolCallMessage', () => {
  it('should format a function tool call', () => {
    const result = formatToolCallMessage(
      'functions.get_weather',
      { location: 'Tokyo' }
    );
    
    expect(result).toContain('assistant');
    expect(result).toContain('commentary');
    expect(result).toContain('to=functions.get_weather');
    expect(result).toContain('json');
    expect(result).toContain('{"location":"Tokyo"}');
  });

  it('should format a browser tool call', () => {
    const result = formatToolCallMessage(
      'browser.search',
      'weather in Tokyo'
    );
    
    expect(result).toContain('assistant');
    expect(result).toContain('analysis');
    expect(result).toContain('to=browser.search');
    expect(result).toContain('weather in Tokyo');
  });

  it('should throw for invalid tool name', () => {
    expect(() => formatToolCallMessage('invalid', 'test')).toThrow();
  });
});

describe('formatToolResponse', () => {
  it('should format string response', () => {
    const result = formatToolResponse('functions.get_weather', 'Sunny, 20°C');
    
    expect(result).toContain('functions.get_weather to=assistant');
    expect(result).toContain('commentary');
    expect(result).toContain('Sunny, 20°C');
  });

  it('should format object response', () => {
    const result = formatToolResponse('functions.get_weather', { temp: 20, sunny: true });
    
    expect(result).toContain('functions.get_weather to=assistant');
    expect(result).toContain('{"temp":20,"sunny":true}');
  });
});

describe('isToolCallMessage', () => {
  it('should detect function tool calls', () => {
    const message = '<|start|>assistant<|channel|>commentary to=functions.get_weather<|message|>...';
    expect(isToolCallMessage(message)).toBe(true);
  });

  it('should detect browser tool calls', () => {
    const message = '<|start|>assistant<|channel|>analysis to=browser.search<|message|>...';
    expect(isToolCallMessage(message)).toBe(true);
  });

  it('should detect python tool calls', () => {
    const message = '<|start|>assistant<|channel|>analysis to=python<|message|>...';
    expect(isToolCallMessage(message)).toBe(true);
  });

  it('should not detect non-tool messages', () => {
    const message = '<|start|>assistant<|channel|>final<|message|>Hello world';
    expect(isToolCallMessage(message)).toBe(false);
  });
});

describe('extractToolInfoFromMessage', () => {
  it('should extract tool info from function call', () => {
    const message = '<|start|>assistant<|channel|>commentary to=functions.get_weather<|message|>...';
    const result = extractToolInfoFromMessage(message);
    
    expect(result).toEqual({
      toolName: 'functions.get_weather',
      namespace: 'functions',
      functionName: 'get_weather',
      channel: HARMONY_CHANNELS.COMMENTARY,
      constraintType: CONSTRAINT_TYPES.JSON
    });
  });

  it('should return null for non-tool messages', () => {
    const message = '<|start|>assistant<|channel|>final<|message|>Hello';
    const result = extractToolInfoFromMessage(message);
    
    expect(result).toBeNull();
  });
});