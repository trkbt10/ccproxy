import { describe, it, expect } from 'vitest';
import { formatCurrentDate } from './format-current-date';

describe('formatCurrentDate', () => {
  it('should format date in YYYY-MM-DD format', () => {
    const result = formatCurrentDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return current date', () => {
    const result = formatCurrentDate();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});