import { describe, it, expect, beforeEach } from 'vitest';
import { setPushModeEnabled, isPushModeEnabled, getSingleFetchCooldownMs } from './pushMode.js';

describe('pushMode', () => {
  beforeEach(() => setPushModeEnabled(true));

  it('is enabled by default', () => {
    expect(isPushModeEnabled()).toBe(true);
  });

  it('coerces truthy and falsy values to booleans', () => {
    setPushModeEnabled(0);
    expect(isPushModeEnabled()).toBe(false);
    setPushModeEnabled('yes');
    expect(isPushModeEnabled()).toBe(true);
    setPushModeEnabled(undefined);
    expect(isPushModeEnabled()).toBe(false);
  });

  it('uses a longer single-fetch cooldown when push is on than when it is off', () => {
    setPushModeEnabled(true);
    const on = getSingleFetchCooldownMs();
    setPushModeEnabled(false);
    const off = getSingleFetchCooldownMs();
    expect(on).toBe(60000);
    expect(off).toBe(10000);
    expect(on).toBeGreaterThan(off);
  });
});
