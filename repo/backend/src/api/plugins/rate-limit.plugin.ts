import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Knex } from 'knex';

async function consumeToken(db: Knex, bucketId: string, maxTokens: number, refillRate: number, ownerUserId?: string, ownerOrgId?: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();

  // Upsert bucket (with RLS-safe owner columns)
  await db.raw(`
    INSERT INTO rate_limit_buckets (id, tokens, max_tokens, refill_rate, last_refill_at, owner_user_id, owner_org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING
  `, [bucketId, maxTokens, maxTokens, refillRate, now, ownerUserId ?? null, ownerOrgId ?? null]);

  // Atomic refill + consume
  const result = await db.raw(`
    UPDATE rate_limit_buckets
    SET
      tokens = LEAST(
        max_tokens,
        tokens + refill_rate * EXTRACT(EPOCH FROM (NOW() - last_refill_at))
      ) - 1,
      last_refill_at = NOW()
    WHERE id = ?
    RETURNING tokens
  `, [bucketId]);

  const remaining = result.rows[0]?.tokens ?? 0;
  if (remaining < 0) {
    const retryAfter = Math.ceil(1 / refillRate);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function rateLimitBooking(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) return;

  const { userId, orgId } = request.user;
  const db = request.db;

  // Per-user limit: 20/min = 0.333/sec
  const userResult = await consumeToken(db, `user:${userId}`, 20, 20 / 60, userId, undefined);
  if (!userResult.allowed) {
    return reply.status(429).send({
      error: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      retryAfterSeconds: userResult.retryAfterSeconds,
    });
  }

  // Per-org limit: 200/min = 3.333/sec
  const orgResult = await consumeToken(db, `org:${orgId}`, 200, 200 / 60, undefined, orgId);
  if (!orgResult.allowed) {
    return reply.status(429).send({
      error: 'RATE_LIMITED',
      message: 'Organization rate limit exceeded. Please try again later.',
      retryAfterSeconds: orgResult.retryAfterSeconds,
    });
  }
}

export default fp(async (_app: FastifyInstance) => {
  // Plugin registers the rateLimitBooking preHandler utility
}, { name: 'rate-limit' });
