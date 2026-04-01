import { Knex } from 'knex';
import { Job, JobStatus, JobType, calculateBackoffMs, shouldMarkDead } from '../../../domain/entities/job.js';

function toDomain(row: any): Job {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    lastError: row.last_error,
    shardKey: row.shard_key,
    idempotencyKey: row.idempotency_key,
    lockedBy: row.locked_by,
    orgId: row.org_id ?? null,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

const TOTAL_SHARDS = 4;

function computeShardKey(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % TOTAL_SHARDS;
}

export class KnexJobRepository {
  constructor(private db: Knex) {}

  async findById(id: string): Promise<Job | null> {
    const row = await this.db('jobs').where({ id }).first();
    return row ? toDomain(row) : null;
  }

  async findAll(filters?: { status?: string; type?: string; orgId?: string; page?: number; limit?: number }): Promise<{ data: Job[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    let query = this.db('jobs');
    if (filters?.status) query = query.where({ status: filters.status });
    if (filters?.type) query = query.where({ type: filters.type });
    if (filters?.orgId) query = query.where({ org_id: filters.orgId });

    const countResult = await query.clone().count('id as count').first();
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
    return { data: rows.map(toDomain), total: Number(countResult?.count ?? 0) };
  }

  async enqueue(input: { type: JobType; payload?: Record<string, unknown>; priority?: number; idempotencyKey?: string; scheduledAt?: Date; orgId?: string; shardKey?: number }): Promise<Job> {
    // Compute shard_key deterministically from type + orgId (or idempotencyKey)
    const shardKey = input.shardKey ?? computeShardKey(input.type + (input.orgId ?? input.idempotencyKey ?? ''));
    const [row] = await this.db('jobs').insert({
      type: input.type,
      payload: JSON.stringify(input.payload ?? {}),
      priority: input.priority ?? 0,
      idempotency_key: input.idempotencyKey ?? null,
      next_retry_at: input.scheduledAt ?? null,
      org_id: input.orgId ?? null,
      shard_key: shardKey,
    }).returning('*');
    return toDomain(row);
  }

  async claimJobs(workerId: string, batchSize: number = 5, shardKeys?: number[]): Promise<Job[]> {
    const shardClause = shardKeys && shardKeys.length > 0
      ? `AND shard_key IN (${shardKeys.map(() => '?').join(',')})`
      : '';
    const params: any[] = [workerId];
    if (shardKeys && shardKeys.length > 0) params.push(...shardKeys);
    params.push(batchSize);

    const rows = await this.db.raw(`
      UPDATE jobs SET
        status = 'running',
        locked_by = ?,
        started_at = NOW(),
        attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status IN ('queued', 'failed')
          AND attempts < max_attempts
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          ${shardClause}
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ?
      )
      RETURNING *
    `, params);

    return rows.rows.map(toDomain);
  }

  async markCompleted(id: string): Promise<void> {
    await this.db('jobs').where({ id }).update({
      status: 'completed',
      completed_at: new Date(),
      locked_by: null,
    });
  }

  async markFailed(id: string, error: string, attempts: number, maxAttempts: number): Promise<void> {
    const isDead = shouldMarkDead(attempts, maxAttempts);
    const nextRetryAt = isDead ? null : new Date(Date.now() + calculateBackoffMs(attempts));

    await this.db('jobs').where({ id }).update({
      status: isDead ? 'dead' : 'failed',
      last_error: error,
      next_retry_at: nextRetryAt,
      locked_by: null,
    });
  }
}
