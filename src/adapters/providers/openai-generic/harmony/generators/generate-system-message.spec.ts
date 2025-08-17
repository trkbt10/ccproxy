import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSystemMessage } from './generate-system-message';
import type { ResponseCreateParamsBase } from '../types';

describe('generateSystemMessage', () => {
  beforeEach(() => {
    // Mock the current date
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2025);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(5); // June (0-indexed)
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(28);
  });

  it('should generate basic system message without tools', () => {
    const params: ResponseCreateParamsBase = {};
    const result = generateSystemMessage(params);
    
    expect(result).toContain('<|start|>system<|message|>');
    expect(result).toContain('You are ChatGPT, a large language model trained by OpenAI.');
    expect(result).toContain('Knowledge cutoff: 2024-06');
    expect(result).toContain('Current date: 2025-06-28');
    expect(result).toContain('Reasoning: medium');
    expect(result).toContain('# Valid channels: analysis, commentary, final');
    expect(result).toContain('<|end|>');
    expect(result).not.toContain("Calls to these tools must go to the commentary channel: 'functions'.");
  });

  it('should use custom knowledge cutoff', () => {
    const params: ResponseCreateParamsBase = {};
    const result = generateSystemMessage(params, '2025-01');
    
    expect(result).toContain('Knowledge cutoff: 2025-01');
  });

  it('should map reasoning effort', () => {
    const params: ResponseCreateParamsBase = {
      reasoning: { effort: 'high' }
    };
    const result = generateSystemMessage(params);
    
    expect(result).toContain('Reasoning: high');
  });

  it('should add function tool routing when function tools present', () => {
    const params: ResponseCreateParamsBase = {
      tools: [
        // Testing incomplete FunctionTool without required field 'parameters'
        // This tests the system's ability to handle minimal function tools at runtime
        // @ts-ignore
        { type: 'function', name: 'test_func', strict: null }
      ]
    };
    const result = generateSystemMessage(params);
    
    expect(result).toContain("Calls to these tools must go to the commentary channel: 'functions'.");
  });

  it('should add browser tool definition', () => {
    const params: ResponseCreateParamsBase = {
      tools: [
        { type: 'web_search_preview_2025_03_11' }
      ]
    };
    const result = generateSystemMessage(params);
    
    expect(result).toContain('# Tools');
    expect(result).toContain('## browser');
    expect(result).toContain('namespace browser {');
    expect(result).toContain('type search = (_: {');
    expect(result).toContain('type open = (_: {');
    expect(result).toContain('type find = (_: {');
    expect(result).toContain('} // namespace browser');
  });

  it('should add python tool definition', () => {
    const params: ResponseCreateParamsBase = {
      tools: [
        // Testing CodeInterpreter without required 'container' property
        // This tests handling of incomplete code interpreter tool definitions
        // @ts-ignore
        { type: 'code_interpreter' }
      ]
    };
    const result = generateSystemMessage(params);
    
    expect(result).toContain('# Tools');
    expect(result).toContain('## python');
    expect(result).toContain('Use this tool to execute Python code');
    expect(result).toContain('stateful Jupyter notebook environment');
  });

  it('should add both browser and python tools', () => {
    const params: ResponseCreateParamsBase = {
      tools: [
        { type: 'web_search_preview_2025_03_11' },
        // Testing CodeInterpreter without required 'container' property
        // This tests handling of incomplete code interpreter tool definitions
        // @ts-ignore
        { type: 'code_interpreter' },
        // Testing incomplete FunctionTool without required field 'parameters'
        // @ts-ignore
        { type: 'function', name: 'custom_func', strict: null }
      ]
    };
    const result = generateSystemMessage(params);
    
    expect(result).toContain('## browser');
    expect(result).toContain('## python');
    expect(result).toContain("Calls to these tools must go to the commentary channel: 'functions'.");
  });

  it('should handle empty tools array', () => {
    const params: ResponseCreateParamsBase = {
      tools: []
    };
    const result = generateSystemMessage(params);
    
    expect(result).not.toContain('# Tools');
    expect(result).not.toContain("Calls to these tools must go to the commentary channel: 'functions'.");
  });
});