import { describe, it, expect } from 'vitest';
import { unitColorMap } from './unitColorMap.js';

describe('unitColorMap', () => {
  const entries = Object.entries(unitColorMap);

  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it('uses three-letter upper-case unit codes', () => {
    for (const [code] of entries) expect(code).toMatch(/^[A-Z]{3}$/);
  });

  it('maps every unit to a 6-digit hex colour', () => {
    for (const [, colour] of entries) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('uses a small palette (map colouring)', () => {
    expect(new Set(Object.values(unitColorMap)).size).toBeLessThanOrEqual(5);
  });
});
