import { describe, it, expect } from 'vitest';
import { formatINR } from './formatters';

describe('formatINR', () => {
  it('formats 0 correctly', () => {
    expect(formatINR(0)).toBe('₹0');
  });

  it('formats small positive numbers correctly', () => {
    expect(formatINR(1000)).toBe('₹1,000');
  });

  it('formats large numbers correctly with Indian number system commas', () => {
    expect(formatINR(1000000)).toBe('₹10,00,000');
  });

  it('rounds numbers with decimals', () => {
    // 1000.50 should round to 1001 based on minimumFractionDigits: 0, maximumFractionDigits: 0
    expect(formatINR(1000.50)).toBe('₹1,001');
    expect(formatINR(1000.49)).toBe('₹1,000');
  });

  it('formats negative numbers correctly', () => {
    expect(formatINR(-500)).toBe('-₹500');
  });
});
