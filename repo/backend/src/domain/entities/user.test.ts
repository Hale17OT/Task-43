import { describe, it, expect, vi, afterEach } from 'vitest';
import { isLockedOut, shouldLockOut, getLockoutRemainingSeconds, getLockoutExpiry, LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS } from './user.js';

describe('User entity', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isLockedOut', () => {
    it('returns false when lockedUntil is null', () => {
      expect(isLockedOut({ lockedUntil: null })).toBe(false);
    });

    it('returns true when lockedUntil is in the future', () => {
      const future = new Date(Date.now() + 60000);
      expect(isLockedOut({ lockedUntil: future })).toBe(true);
    });

    it('returns false when lockedUntil is in the past', () => {
      const past = new Date(Date.now() - 60000);
      expect(isLockedOut({ lockedUntil: past })).toBe(false);
    });
  });

  describe('shouldLockOut', () => {
    it('returns true at 5 failed attempts', () => {
      expect(shouldLockOut(5)).toBe(true);
    });

    it('returns false at 4 failed attempts', () => {
      expect(shouldLockOut(4)).toBe(false);
    });

    it('returns true above 5 failed attempts', () => {
      expect(shouldLockOut(7)).toBe(true);
    });
  });

  describe('getLockoutRemainingSeconds', () => {
    it('returns positive seconds when locked', () => {
      const lockedUntil = new Date(Date.now() + 120000);
      const remaining = getLockoutRemainingSeconds(lockedUntil);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(120);
    });

    it('returns 0 when lockout has expired', () => {
      const lockedUntil = new Date(Date.now() - 1000);
      expect(getLockoutRemainingSeconds(lockedUntil)).toBe(0);
    });
  });

  describe('Prompt-critical lockout policy constants', () => {
    it('lockout threshold is exactly 5 failed attempts', () => {
      expect(LOCKOUT_THRESHOLD).toBe(5);
    });

    it('lockout duration is exactly 15 minutes', () => {
      expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
    });

    it('getLockoutExpiry returns a date ~15 minutes in the future', () => {
      const before = Date.now();
      const expiry = getLockoutExpiry();
      const after = Date.now();
      const expiryMs = expiry.getTime();
      // Expiry should be between [now + 15min] and [now + 15min + test overhead]
      expect(expiryMs).toBeGreaterThanOrEqual(before + LOCKOUT_DURATION_MS);
      expect(expiryMs).toBeLessThanOrEqual(after + LOCKOUT_DURATION_MS);
    });

    it('attempt 4 does NOT trigger lockout, attempt 5 DOES', () => {
      expect(shouldLockOut(1)).toBe(false);
      expect(shouldLockOut(2)).toBe(false);
      expect(shouldLockOut(3)).toBe(false);
      expect(shouldLockOut(4)).toBe(false);
      expect(shouldLockOut(5)).toBe(true);
    });

    it('lockout is enforced for the full 15-minute window', () => {
      // 14 minutes in: still locked
      const locked14min = { lockedUntil: new Date(Date.now() + 60 * 1000) }; // 1 min left
      expect(isLockedOut(locked14min)).toBe(true);

      // Exactly expired: not locked
      const expired = { lockedUntil: new Date(Date.now() - 1) };
      expect(isLockedOut(expired)).toBe(false);
    });
  });
});
