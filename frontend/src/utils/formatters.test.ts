import { describe, it, expect } from 'vitest';
import { getPoolDisplayName } from './formatters';

describe('getPoolDisplayName', () => {
  it('should return predefined names for known pool IDs', () => {
    expect(getPoolDisplayName('delhi_aqi_pool')).toBe('Delhi NCR - Air Quality Pool');
    expect(getPoolDisplayName('mumbai_rain_pool')).toBe('Mumbai - Rainfall Pool');
    expect(getPoolDisplayName('chennai_rain_pool')).toBe('Chennai - Rainfall Pool');
    expect(getPoolDisplayName('bangalore_mixed_pool')).toBe('Bengaluru - Mixed Risk Pool');
    expect(getPoolDisplayName('kolkata_flood_pool')).toBe('Kolkata - Flood Risk Pool');
  });

  it('should format unknown pool IDs correctly', () => {
    expect(getPoolDisplayName('unknown_pool_id')).toBe('Unknown Pool Id');
    expect(getPoolDisplayName('new_risk_pool')).toBe('New Risk Pool');
  });

  it('should handle single word unknown pool IDs', () => {
    expect(getPoolDisplayName('test')).toBe('Test');
    expect(getPoolDisplayName('pool')).toBe('Pool');
  });

  it('should handle edge cases like empty string', () => {
    expect(getPoolDisplayName('')).toBe('');
  });
});
