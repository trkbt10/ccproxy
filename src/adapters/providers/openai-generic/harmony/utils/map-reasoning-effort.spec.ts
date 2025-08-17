import { describe, it, expect } from 'vitest';
import { mapReasoningEffort } from './map-reasoning-effort';
import type { Reasoning } from '../types';

describe('mapReasoningEffort', () => {
  it('should return medium as default when no reasoning provided', () => {
    expect(mapReasoningEffort()).toBe('medium');
    expect(mapReasoningEffort(null)).toBe('medium');
  });

  it('should return medium when reasoning has no effort', () => {
    const reasoning: Reasoning = {};
    expect(mapReasoningEffort(reasoning)).toBe('medium');
  });

  it('should map high effort correctly', () => {
    const reasoning: Reasoning = { effort: 'high' };
    expect(mapReasoningEffort(reasoning)).toBe('high');
  });

  it('should map medium effort correctly', () => {
    const reasoning: Reasoning = { effort: 'medium' };
    expect(mapReasoningEffort(reasoning)).toBe('medium');
  });

  it('should map low effort correctly', () => {
    const reasoning: Reasoning = { effort: 'low' };
    expect(mapReasoningEffort(reasoning)).toBe('low');
  });

  it('should map minimal effort to low', () => {
    const reasoning: Reasoning = { effort: 'minimal' };
    expect(mapReasoningEffort(reasoning)).toBe('low');
  });

  it('should return medium for null effort', () => {
    const reasoning: Reasoning = { effort: null };
    expect(mapReasoningEffort(reasoning)).toBe('medium');
  });
});