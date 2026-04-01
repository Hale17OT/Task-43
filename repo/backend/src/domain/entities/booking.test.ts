import { describe, it, expect } from 'vitest';
import { isValidTransition, isWithinCancellationPenaltyWindow, isPastNoShowGrace } from './booking.js';

describe('Booking entity', () => {
  describe('isValidTransition', () => {
    it('allows pending → confirmed', () => {
      expect(isValidTransition('pending', 'confirmed')).toBe(true);
    });

    it('allows pending → declined', () => {
      expect(isValidTransition('pending', 'declined')).toBe(true);
    });

    it('allows pending → cancelled', () => {
      expect(isValidTransition('pending', 'cancelled')).toBe(true);
    });

    it('allows confirmed → completed', () => {
      expect(isValidTransition('confirmed', 'completed')).toBe(true);
    });

    it('allows confirmed → no_show', () => {
      expect(isValidTransition('confirmed', 'no_show')).toBe(true);
    });

    it('allows confirmed → cancelled', () => {
      expect(isValidTransition('confirmed', 'cancelled')).toBe(true);
    });

    it('rejects completed → cancelled', () => {
      expect(isValidTransition('completed', 'cancelled')).toBe(false);
    });

    it('rejects cancelled → confirmed', () => {
      expect(isValidTransition('cancelled', 'confirmed')).toBe(false);
    });

    it('rejects no_show → anything', () => {
      expect(isValidTransition('no_show', 'completed')).toBe(false);
    });
  });

  describe('isWithinCancellationPenaltyWindow', () => {
    it('returns true when cancelling less than 2h before', () => {
      const scheduledAt = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-15T08:30:00Z'); // 1.5h before
      expect(isWithinCancellationPenaltyWindow(scheduledAt, now)).toBe(true);
    });

    it('returns false when cancelling more than 2h before', () => {
      const scheduledAt = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-15T07:00:00Z'); // 3h before
      expect(isWithinCancellationPenaltyWindow(scheduledAt, now)).toBe(false);
    });

    it('returns true when cancelling exactly at 2h', () => {
      const scheduledAt = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-15T08:00:00Z'); // exactly 2h
      expect(isWithinCancellationPenaltyWindow(scheduledAt, now)).toBe(false);
    });
  });

  describe('isPastNoShowGrace', () => {
    it('returns true when 11 minutes past', () => {
      const scheduledAt = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-15T10:11:00Z');
      expect(isPastNoShowGrace(scheduledAt, now)).toBe(true);
    });

    it('returns false when 5 minutes past', () => {
      const scheduledAt = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-15T10:05:00Z');
      expect(isPastNoShowGrace(scheduledAt, now)).toBe(false);
    });

    it('returns false when exactly 10 minutes past', () => {
      const scheduledAt = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-15T10:10:00Z');
      expect(isPastNoShowGrace(scheduledAt, now)).toBe(false);
    });
  });
});
