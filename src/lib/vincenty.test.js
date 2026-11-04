import { describe, it, expect } from 'vitest';
import { distVincenty } from './vincenty.js';

describe('distVincenty', () => {
  it('matches the published Vincenty test vector (Flinders Peak -> Buninyong)', () => {
    // Geoscience Australia worked example: 54 972.271 m.
    const d = Number(distVincenty(-37.95103341666667, 144.42486788888888, -37.65282113888889, 143.92649552777777));
    expect(d).toBeCloseTo(54972.271, 2);
  });

  it('is zero for co-incident points', () => {
    expect(distVincenty(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(0);
  });

  it('is symmetric', () => {
    const ab = Number(distVincenty(-33.8688, 151.2093, -37.8136, 144.9631));
    const ba = Number(distVincenty(-37.8136, 144.9631, -33.8688, 151.2093));
    expect(ab).toBeCloseTo(ba, 3);
  });

  it('puts Sydney -> Melbourne at roughly 713 km', () => {
    const km = Number(distVincenty(-33.8688, 151.2093, -37.8136, 144.9631)) / 1000;
    expect(km).toBeGreaterThan(705);
    expect(km).toBeLessThan(720);
  });

  it('measures one degree of longitude on the equator as ~111.3 km', () => {
    const km = Number(distVincenty(0, 0, 0, 1)) / 1000;
    expect(km).toBeCloseTo(111.319, 2);
  });

  it('measures one degree of latitude as ~110.6-111.7 km', () => {
    const km = Number(distVincenty(0, 0, 1, 0)) / 1000;
    expect(km).toBeGreaterThan(110.5);
    expect(km).toBeLessThan(111.8);
  });

  it('returns a string rounded to 1mm (documents current behaviour)', () => {
    const d = distVincenty(-33.8688, 151.2093, -33.8700, 151.2100);
    expect(typeof d).toBe('string');
    expect(d).toMatch(/^\d+\.\d{3}$/);
  });

  it('returns NaN rather than hanging for nearly antipodal points', () => {
    expect(Number(distVincenty(0, 0, 0.5, 179.7))).toBeNaN();
  });
});
