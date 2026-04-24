import { describe, it, expect } from 'vitest';
import {
  formatINR,
  POOL_DISPLAY_NAMES,
  getPoolDisplayName,
  formatHex,
  formatPhone,
  formatDateTime
} from './formatters';

describe('formatters', () => {
  describe('formatINR', () => {
    it('formats zero correctly', () => {
      expect(formatINR(0)).toBe('₹0');
    });

    it('formats positive integers correctly', () => {
      expect(formatINR(100)).toBe('₹100');
    });

    it('formats negative integers correctly', () => {
      // Different node versions might format negative currency differently
      // e.g., -₹100 or ₹-100. Node 22 seems to do -₹100
      expect(formatINR(-100)).toMatch(/-₹100|₹-100/);
    });

    it('formats floating point numbers correctly (rounds to nearest integer)', () => {
      expect(formatINR(100.4)).toBe('₹100');
      expect(formatINR(100.5)).toBe('₹101');
      expect(formatINR(100.6)).toBe('₹101');
    });

    it('formats large numbers using Indian numbering system', () => {
      expect(formatINR(100000)).toBe('₹1,00,000'); // One Lakh
      expect(formatINR(10000000)).toBe('₹1,00,00,000'); // One Crore
      expect(formatINR(1234567)).toBe('₹12,34,567');
    });
  });

  describe('getPoolDisplayName', () => {
    it('returns known pool display names', () => {
      expect(getPoolDisplayName('delhi_aqi_pool')).toBe(POOL_DISPLAY_NAMES['delhi_aqi_pool']);
      expect(getPoolDisplayName('mumbai_rain_pool')).toBe(POOL_DISPLAY_NAMES['mumbai_rain_pool']);
    });

    it('generates display name for unknown pool IDs', () => {
      expect(getPoolDisplayName('unknown_risk_pool')).toBe('Unknown Risk Pool');
      expect(getPoolDisplayName('custom_event_pool')).toBe('Custom Event Pool');
    });
  });

  describe('formatHex', () => {
    it('truncates hex strings to 8 characters and appends ellipses', () => {
      expect(formatHex('0x1234567890abcdef')).toBe('0x123456...');
      expect(formatHex('1234567890')).toBe('12345678...');
    });

    it('handles strings shorter than 8 characters', () => {
      expect(formatHex('0x123')).toBe('0x123...');
    });
  });

  describe('formatPhone', () => {
    it('formats +91 numbers correctly', () => {
      expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    });

    it('returns original string if it does not match the pattern', () => {
      expect(formatPhone('9876543210')).toBe('9876543210'); // Missing +91
      expect(formatPhone('+9198765')).toBe('+9198765'); // Too short
    });
  });

  describe('formatDateTime', () => {
    it('formats ISO datetime strings correctly', () => {
      const iso = '2023-10-27T10:30:00Z'; // UTC time
      const dt = new Date(iso);
      const expected = dt.toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      expect(formatDateTime(iso)).toBe(expected);
    });
  });
});
