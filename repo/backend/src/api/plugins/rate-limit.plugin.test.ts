import { describe, it, expect, vi } from 'vitest';
import { rateLimitBooking } from './rate-limit.plugin.js';

/**
 * Direct tests for the `rateLimitBooking` preHandler.
 *
 * The preHandler runs two token-bucket checks (per-user then per-org)
 * via raw SQL. We drive it with a tiny `db.raw` mock that tracks the
 * simulated token state so we can assert:
 *   - allowed request (tokens remaining) → passes without reply
 *   - user-limit exceeded → 429 with RATE_LIMITED + retryAfterSeconds
 *   - org-limit exceeded → 429 with org-specific message
 *   - unauthenticated request (no request.user) → noop
 */

function mockReply() {
  const reply: any = {
    statusCode: 0,
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(function (this: any, body: any) {
      this._body = body;
      return this;
    }),
    _body: null,
  };
  return reply;
}

/**
 * Build a mock `db` whose `.raw(sql, params)` returns:
 *   - { rows: [] } for INSERT ... ON CONFLICT
 *   - { rows: [{ tokens: <configurable> }] } for UPDATE ... RETURNING tokens
 *
 * The `remainingAfterUpdate` callback receives the bucket id and returns
 * the token count to report after a successful consume.
 */
function mockDb(remainingAfterUpdate: (bucketId: string) => number) {
  const raw = vi.fn(async (sql: string, params: any[]) => {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('INSERT')) {
      return { rows: [] };
    }
    if (trimmed.startsWith('UPDATE')) {
      const bucketId = params[0] as string;
      return { rows: [{ tokens: remainingAfterUpdate(bucketId) }] };
    }
    return { rows: [] };
  });
  return { raw } as any;
}

function mockRequest(db: any, overrides: Partial<{ userId: string; orgId: string }> = {}) {
  return {
    user: { userId: overrides.userId ?? 'u-1', orgId: overrides.orgId ?? 'o-1', role: 'client' },
    db,
  } as any;
}

describe('rateLimitBooking — per-user + per-org token bucket', () => {
  it('passes when both user and org buckets still have tokens', async () => {
    const db = mockDb(() => 19); // plenty of tokens remain
    const request = mockRequest(db);
    const reply = mockReply();

    await rateLimitBooking(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    // Both buckets should have been consulted: user:<id> and org:<id>
    const updateCalls = db.raw.mock.calls.filter((c: any[]) => c[0].trim().toUpperCase().startsWith('UPDATE'));
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0][1][0]).toBe('user:u-1');
    expect(updateCalls[1][1][0]).toBe('org:o-1');
  });

  it('returns 429 RATE_LIMITED when user bucket is exhausted and skips the org bucket', async () => {
    const db = mockDb((bucket) => (bucket.startsWith('user:') ? -1 : 99));
    const request = mockRequest(db);
    const reply = mockReply();

    await rateLimitBooking(request, reply);

    expect(reply.statusCode).toBe(429);
    expect(reply._body.error).toBe('RATE_LIMITED');
    expect(typeof reply._body.message).toBe('string');
    expect(typeof reply._body.retryAfterSeconds).toBe('number');
    expect(reply._body.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    // Only the user bucket UPDATE should have executed (short-circuit).
    const updateCalls = db.raw.mock.calls.filter((c: any[]) => c[0].trim().toUpperCase().startsWith('UPDATE'));
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][1][0]).toBe('user:u-1');
  });

  it('returns 429 with org-specific message when org bucket is exhausted', async () => {
    const db = mockDb((bucket) => (bucket.startsWith('org:') ? -1 : 19));
    const request = mockRequest(db);
    const reply = mockReply();

    await rateLimitBooking(request, reply);

    expect(reply.statusCode).toBe(429);
    expect(reply._body.error).toBe('RATE_LIMITED');
    expect(reply._body.message.toLowerCase()).toContain('organization');
  });

  it('no-ops when request has no authenticated user (preHandler ordering safety)', async () => {
    const db = mockDb(() => 19);
    const request = { db } as any;
    const reply = mockReply();

    await rateLimitBooking(request, reply);

    expect(db.raw).not.toHaveBeenCalled();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('bucket ids are scoped per (user, org) so different users do not share a bucket', async () => {
    const db = mockDb(() => 19);
    const reply = mockReply();

    await rateLimitBooking(mockRequest(db, { userId: 'user-A', orgId: 'org-1' }), reply);
    await rateLimitBooking(mockRequest(db, { userId: 'user-B', orgId: 'org-2' }), reply);

    const updateBuckets = db.raw.mock.calls
      .filter((c: any[]) => c[0].trim().toUpperCase().startsWith('UPDATE'))
      .map((c: any[]) => c[1][0]);
    expect(updateBuckets).toContain('user:user-A');
    expect(updateBuckets).toContain('user:user-B');
    expect(updateBuckets).toContain('org:org-1');
    expect(updateBuckets).toContain('org:org-2');
  });
});
