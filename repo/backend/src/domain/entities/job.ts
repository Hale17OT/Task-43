export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead';
export type JobType = 'report-generation' | 'record-import' | 'compliance-check' | 'idempotency-vacuum';

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  shardKey: number | null;
  idempotencyKey: string | null;
  lockedBy: string | null;
  orgId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export function calculateBackoffMs(attempts: number): number {
  return Math.pow(2, attempts) * 1000;
}

export function shouldMarkDead(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}
