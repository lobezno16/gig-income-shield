import { describe, it, expect, vi } from 'vitest';
import { formatDateTime, formatINR, getPoolDisplayName, formatHex, formatPhone } from '../formatters';

describe('formatDateTime', () => {
  it('formats a valid ISO date correctly in en-IN format', () => {
    // We can spy on Date.prototype.toLocaleString to test exactly what it is called with,
    // which makes the test timezone-independent and robust.
    const dateStr = '2023-10-15T14:30:00.000Z';
    const toLocaleStringSpy = vi.spyOn(Date.prototype, 'toLocaleString');

    formatDateTime(dateStr);

    expect(toLocaleStringSpy).toHaveBeenCalledWith("en-IN", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    toLocaleStringSpy.mockRestore();
  });

  it('handles standard ISO string dates correctly', () => {
    const dateStr = '2023-01-01T00:00:00.000Z';
    const formatted = formatDateTime(dateStr);

    expect(typeof formatted).toBe('string');
    expect(formatted).not.toBe('Invalid Date');
    expect(formatted).toMatch(/Jan/);
  });

  it('handles invalid dates gracefully by returning "Invalid Date"', () => {
    const formatted = formatDateTime('invalid-date-string');
    expect(formatted).toBe('Invalid Date');
  });

  it('handles edge case: empty string', () => {
    const formatted = formatDateTime('');
    expect(formatted).toBe('Invalid Date');
  });

  it('handles edge case: epoch time (1970-01-01T00:00:00.000Z)', () => {
    const formatted = formatDateTime('1970-01-01T00:00:00.000Z');
    expect(typeof formatted).toBe('string');
    expect(formatted).not.toBe('Invalid Date');
  });
});

describe('formatINR', () => {
  it('formats positive numbers correctly', () => {
    expect(formatINR(1234567)).toMatch(/₹/);
    // Depending on node version/locale data, the space could be narrow no-break space
    expect(formatINR(1234567).replace(/\s/g, '').replace(/\u00A0/g, '').replace(/\u202F/g, '')).toBe('₹12,34,567');
  });

  it('formats zero correctly', () => {
    expect(formatINR(0).replace(/\s/g, '').replace(/\u00A0/g, '').replace(/\u202F/g, '')).toBe('₹0');
  });
});

describe('getPoolDisplayName', () => {
  it('returns mapped name for known pool ID', () => {
    expect(getPoolDisplayName('delhi_aqi_pool')).toBe('Delhi NCR - Air Quality Pool');
  });

  it('formats unknown pool ID by replacing underscores and capitalizing', () => {
    expect(getPoolDisplayName('unknown_pool_id')).toBe('Unknown Pool Id');
  });
});

describe('formatHex', () => {
  it('truncates hex strings to 8 characters and appends ellipsis', () => {
    expect(formatHex('1234567890abcdef')).toBe('12345678...');
  });

  it('handles shorter strings by appending ellipsis to the full string', () => {
    expect(formatHex('1234')).toBe('1234...');
  });
});

describe('formatPhone', () => {
  it('formats +91 phone numbers with spaces', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('returns original string if it does not match the pattern', () => {
    expect(formatPhone('9876543210')).toBe('9876543210');
    expect(formatPhone('+1234567890')).toBe('+1234567890');
  });
});
