import { describe, it, expect } from 'vitest';
import { handleToolChoice } from './handle-tool-choice';
import type { ToolChoice, ToolChoiceFunction } from '../types';
import { 
  toolChoiceNone, 
  toolChoiceAuto, 
  toolChoiceRequired,
  createToolChoiceFunction,
  createToolChoiceCustom,
  createToolChoiceAllowed
} from '../fixtures.test.support';

describe('handleToolChoice', () => {
  it('should return null when no tool choice provided', () => {
    expect(handleToolChoice()).toBeNull();
  });

  it('should handle string option "none"', () => {
    expect(handleToolChoice(toolChoiceNone)).toBe('Do not use any tools.');
  });

  it('should handle string option "auto"', () => {
    expect(handleToolChoice(toolChoiceAuto)).toBeNull();
  });

  it('should handle string option "required"', () => {
    expect(handleToolChoice(toolChoiceRequired)).toBe('You must use one or more tools to respond.');
  });

  it('should handle ToolChoiceAllowed with required mode', () => {
    const toolChoice = createToolChoiceAllowed('required');
    expect(handleToolChoice(toolChoice)).toBe('You must use one or more tools to respond.');
  });

  it('should handle ToolChoiceAllowed with required mode and allowed list', () => {
    const toolChoice = createToolChoiceAllowed('required', [
      { type: 'function', name: 'get_weather' },
      { type: 'function', name: 'get_location' }
    ]);
    expect(handleToolChoice(toolChoice)).toBe('You must use one of these tools: get_weather, get_location.');
  });

  it('should handle ToolChoiceAllowed with auto mode', () => {
    const toolChoice = createToolChoiceAllowed('auto');
    expect(handleToolChoice(toolChoice)).toBeNull();
  });

  it('should handle ToolChoiceFunction', () => {
    const toolChoice = createToolChoiceFunction('get_weather');
    expect(handleToolChoice(toolChoice)).toBe('You must use the get_weather function.');
  });

  it('should handle ToolChoiceFunction without name', () => {
    // Create an invalid function choice by bypassing the factory
    const toolChoice: ToolChoice = {
      type: 'function',
      name: ''
    } as ToolChoiceFunction;
    expect(handleToolChoice(toolChoice)).toBeNull();
  });

  it('should handle ToolChoiceCustom', () => {
    const toolChoice = createToolChoiceCustom('browser');
    expect(handleToolChoice(toolChoice)).toBe('You must use the browser tool.');
  });

  it('should handle ToolChoiceCustom without name', () => {
    // Create an invalid custom choice by bypassing the factory
    const toolChoice: ToolChoice = {
      type: 'custom',
      name: '' // Empty name
    };
    expect(handleToolChoice(toolChoice)).toBeNull();
  });

  it('should handle unknown tool choice objects', () => {
    const toolChoice = { unknown: 'value' } as unknown as ToolChoice;
    expect(handleToolChoice(toolChoice)).toBeNull();
  });
});