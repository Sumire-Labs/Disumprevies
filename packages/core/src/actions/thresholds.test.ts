import { describe, it, expect } from 'vitest';
import { resolveAction, THRESHOLDS, DECAY_POINTS_PER_MS } from './thresholds.js';

describe('resolveAction', () => {
  it('returns undefined when points are below all thresholds', () => {
    expect(resolveAction(0)).toBeUndefined();
    expect(resolveAction(2.9)).toBeUndefined();
  });

  it('returns WARN at 3 points', () => {
    const result = resolveAction(3);
    expect(result?.action).toBe('WARN');
  });

  it('returns MUTE at 6 points with correct duration', () => {
    const result = resolveAction(6);
    expect(result?.action).toBe('MUTE');
    expect(result?.muteDurationMinutes).toBe(10);
  });

  it('returns KICK at 9 points', () => {
    const result = resolveAction(9);
    expect(result?.action).toBe('KICK');
  });

  it('returns BAN at 12 points', () => {
    const result = resolveAction(12);
    expect(result?.action).toBe('BAN');
  });

  it('returns BAN for points above 12', () => {
    const result = resolveAction(20);
    expect(result?.action).toBe('BAN');
  });

  it('thresholds are ordered from lowest to highest', () => {
    const points = THRESHOLDS.map((t) => t.minPoints);
    const sorted = [...points].sort((a, b) => a - b);
    expect(points).toEqual(sorted);
  });
});

describe('DECAY_POINTS_PER_MS', () => {
  it('decays 1 point over exactly 24 hours', () => {
    const msIn24h = 24 * 60 * 60 * 1000;
    expect(DECAY_POINTS_PER_MS * msIn24h).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// Boundary value tests
// ---------------------------------------------------------------------------

describe('resolveAction boundary values', () => {
  // WARN threshold = 3
  it('returns undefined at 2 points (just below WARN threshold)', () => {
    expect(resolveAction(2)).toBeUndefined();
  });

  it('returns undefined at 2.99 (just below WARN threshold)', () => {
    expect(resolveAction(2.99)).toBeUndefined();
  });

  it('returns WARN at exactly 3 points (WARN threshold)', () => {
    expect(resolveAction(3)?.action).toBe('WARN');
  });

  it('returns WARN at 4 and 5 points (between WARN and MUTE)', () => {
    expect(resolveAction(4)?.action).toBe('WARN');
    expect(resolveAction(5)?.action).toBe('WARN');
  });

  // MUTE threshold = 6
  it('returns MUTE at exactly 6 points (MUTE threshold)', () => {
    expect(resolveAction(6)?.action).toBe('MUTE');
  });

  it('returns MUTE at 7 and 8 points (between MUTE and KICK)', () => {
    expect(resolveAction(7)?.action).toBe('MUTE');
    expect(resolveAction(8)?.action).toBe('MUTE');
  });

  // KICK threshold = 9
  it('returns KICK at exactly 9 points (KICK threshold)', () => {
    expect(resolveAction(9)?.action).toBe('KICK');
  });

  it('returns KICK at 10 and 11 points (between KICK and BAN)', () => {
    expect(resolveAction(10)?.action).toBe('KICK');
    expect(resolveAction(11)?.action).toBe('KICK');
  });

  // BAN threshold = 12
  it('returns BAN at exactly 12 points (BAN threshold)', () => {
    expect(resolveAction(12)?.action).toBe('BAN');
  });

  it('returns BAN for points well above 12', () => {
    expect(resolveAction(100)?.action).toBe('BAN');
  });

  // Custom thresholds
  it('uses custom thresholds when provided', () => {
    const custom = [
      { minPoints: 5, action: 'WARN' as const },
      { minPoints: 10, action: 'BAN' as const },
    ];
    expect(resolveAction(4, custom)).toBeUndefined();
    expect(resolveAction(5, custom)?.action).toBe('WARN');
    expect(resolveAction(9, custom)?.action).toBe('WARN');
    expect(resolveAction(10, custom)?.action).toBe('BAN');
  });

  it('falls back to default thresholds when custom array is empty', () => {
    expect(resolveAction(3, [])?.action).toBe('WARN');
  });
});
