import { describe, it, expect } from 'vitest';
import { calculateBackoffMs, shouldMarkDead } from '../domain/entities/job.js';

describe('Job retry backoff calculation', () => {
  it('returns 2000ms for attempt 1 (2^1 * 1000)', () => {
    expect(calculateBackoffMs(1)).toBe(2000);
  });

  it('returns 4000ms for attempt 2 (2^2 * 1000)', () => {
    expect(calculateBackoffMs(2)).toBe(4000);
  });

  it('returns 8000ms for attempt 3 (2^3 * 1000)', () => {
    expect(calculateBackoffMs(3)).toBe(8000);
  });

  it('returns 16000ms for attempt 4 (2^4 * 1000)', () => {
    expect(calculateBackoffMs(4)).toBe(16000);
  });

  it('exponentially increases with each attempt', () => {
    let prev = calculateBackoffMs(0);
    for (let i = 1; i <= 5; i++) {
      const curr = calculateBackoffMs(i);
      expect(curr).toBe(prev * 2);
      prev = curr;
    }
  });
});

describe('Job dead-letter threshold', () => {
  it('marks dead when attempts equal maxAttempts', () => {
    expect(shouldMarkDead(5, 5)).toBe(true);
  });

  it('marks dead when attempts exceed maxAttempts', () => {
    expect(shouldMarkDead(6, 5)).toBe(true);
  });

  it('does not mark dead when attempts are below maxAttempts', () => {
    expect(shouldMarkDead(4, 5)).toBe(false);
  });

  it('does not mark dead on first attempt', () => {
    expect(shouldMarkDead(1, 5)).toBe(false);
  });

  it('marks dead immediately when maxAttempts is 1', () => {
    expect(shouldMarkDead(1, 1)).toBe(true);
  });

  it('never marks dead with 0 attempts', () => {
    expect(shouldMarkDead(0, 5)).toBe(false);
  });
});

describe('JobWorker shard coverage', () => {
  it('default single-node worker claims all 4 shards', async () => {
    // Dynamically import to avoid triggering side effects
    const { JobWorker } = await import('./job-worker.js');

    // Create mock DB (won't be called in this test)
    const mockDb: any = {};

    // Default constructor: no explicit shardKeys → all shards
    const worker = new JobWorker(mockDb);
    // Access private field via type assertion
    const shardKeys = (worker as any).shardKeys;
    expect(shardKeys).toEqual([0, 1, 2, 3]);
    expect(shardKeys.length).toBe(4);
  });

  it('explicit shard subset is used when provided', async () => {
    const { JobWorker } = await import('./job-worker.js');
    const mockDb: any = {};

    const worker = new JobWorker(mockDb, [0, 2]);
    const shardKeys = (worker as any).shardKeys;
    expect(shardKeys).toEqual([0, 2]);
  });
});
