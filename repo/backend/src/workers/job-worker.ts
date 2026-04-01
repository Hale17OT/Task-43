import { Knex } from 'knex';
import { KnexJobRepository } from '../infrastructure/database/repositories/job-repository.js';
import { KnexNotificationRepository } from '../infrastructure/database/repositories/notification-repository.js';
import { logger } from '../infrastructure/logging/index.js';
import { v4 as uuid } from 'uuid';

const POLL_INTERVAL = 5000; // 5 seconds
const BATCH_SIZE = 5;

const TOTAL_SHARDS = 4;

export class JobWorker {
  private running = false;
  private workerId: string;
  private shardKeys: number[];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private db: Knex, shardKeys?: number[]) {
    this.workerId = `worker-${uuid().slice(0, 8)}`;
    // Default: claim all shards (single-node mode).
    // In multi-node deployments, pass explicit shard subsets per worker.
    this.shardKeys = shardKeys ?? Array.from({ length: TOTAL_SHARDS }, (_, i) => i);
  }

  start() {
    if (this.running) return;
    this.running = true;
    logger.info({ workerId: this.workerId, shardKeys: this.shardKeys }, 'Job worker started');

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info({ workerId: this.workerId }, 'Job worker stopped');
  }

  private async poll() {
    if (!this.running) return;

    try {
      const jobRepo = new KnexJobRepository(this.db);
      const jobs = await jobRepo.claimJobs(this.workerId, BATCH_SIZE, this.shardKeys);

      for (const job of jobs) {
        try {
          await this.executeJob(job);
          await jobRepo.markCompleted(job.id);
          logger.info({ jobId: job.id, type: job.type }, 'Job completed');
        } catch (err: any) {
          await jobRepo.markFailed(job.id, err.message, job.attempts, job.maxAttempts);
          logger.error({ jobId: job.id, type: job.type, error: err.message, attempts: job.attempts }, 'Job failed');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Job worker poll error');
    }
  }

  private async executeJob(job: any) {
    // Idempotency guard: if this job has an idempotency key, check
    // whether a completed job with the same key already exists.
    if (job.idempotencyKey) {
      const existing = await this.db('jobs')
        .where({ idempotency_key: job.idempotencyKey, status: 'completed' })
        .whereNot({ id: job.id })
        .first();
      if (existing) {
        logger.info({ jobId: job.id, idempotencyKey: job.idempotencyKey }, 'Skipping duplicate job (idempotency key already completed)');
        return;
      }
    }

    switch (job.type) {
      case 'report-generation':
        await this.handleReportGeneration(job);
        break;
      case 'idempotency-vacuum':
        await this.handleIdempotencyVacuum();
        break;
      case 'record-import':
        await this.handleRecordImport(job);
        break;
      case 'compliance-check':
        await this.handleComplianceCheck(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  private async handleReportGeneration(job: any) {
    const { userId, reportType, filters } = job.payload;
    const notifRepo = new KnexNotificationRepository(this.db);

    await notifRepo.create({
      userId,
      title: `Report Ready: ${reportType}`,
      body: `Your scheduled ${reportType} report has been generated and is ready for viewing.`,
      type: 'report_ready',
    });
  }

  private async handleIdempotencyVacuum() {
    const deleted = await this.db('idempotency_registry')
      .where('expires_at', '<', new Date())
      .del();
    logger.info({ deleted }, 'Idempotency vacuum completed');
  }

  private async handleRecordImport(job: any) {
    const { source, orgId, batchSize: configuredBatchSize } = job.payload;
    const importBatchSize = configuredBatchSize ?? 100;

    // Track progress in the job payload
    const offset = job.payload.processedCount ?? 0;

    logger.info({ jobId: job.id, source, orgId, offset, batchSize: importBatchSize }, 'Record import: processing batch');

    // Fetch records to import from the source table
    const records = await this.db(source ?? 'users')
      .where(orgId ? { org_id: orgId } : {})
      .orderBy('created_at', 'asc')
      .limit(importBatchSize)
      .offset(offset);

    if (records.length === 0) {
      logger.info({ jobId: job.id, totalProcessed: offset }, 'Record import: all records processed');
      return;
    }

    // Persist incremental progress so retries can resume
    const newProcessedCount = offset + records.length;
    await this.db('jobs')
      .where({ id: job.id })
      .update({
        payload: JSON.stringify({
          ...job.payload,
          processedCount: newProcessedCount,
          lastBatchSize: records.length,
          lastProcessedAt: new Date().toISOString(),
        }),
      });

    logger.info({
      jobId: job.id,
      batchProcessed: records.length,
      totalProcessed: newProcessedCount,
    }, 'Record import: batch completed');

    // If there are more records, re-enqueue a continuation job
    if (records.length >= importBatchSize) {
      const jobRepo = new KnexJobRepository(this.db);
      await jobRepo.enqueue({
        type: 'record-import',
        payload: {
          ...job.payload,
          processedCount: newProcessedCount,
        },
        priority: job.priority,
        orgId: orgId ?? undefined,
      });
      logger.info({ jobId: job.id }, 'Record import: continuation job enqueued');
    }
  }

  private async handleComplianceCheck(job: any) {
    const { orgId, checkType } = job.payload;
    const findings: Array<{ entity: string; entityId: string; issue: string; severity: string }> = [];

    logger.info({ jobId: job.id, orgId, checkType }, 'Compliance check: starting');

    // Check 1: Users with credit score below threshold who have active bookings
    if (!checkType || checkType === 'credit_threshold') {
      const lowCreditWithBookings = await this.db('users')
        .join('bookings', 'users.id', 'bookings.client_id')
        .where(orgId ? { 'users.org_id': orgId } : {})
        .where('users.credit_score', '<', 20)
        .whereIn('bookings.status', ['pending', 'confirmed'])
        .select('users.id as userId', 'users.username', 'users.credit_score', 'bookings.id as bookingId')
        .distinct();

      for (const row of lowCreditWithBookings) {
        findings.push({
          entity: 'user',
          entityId: row.userId,
          issue: `User ${row.username} has credit score ${row.credit_score} below threshold with active booking ${row.bookingId}`,
          severity: 'warning',
        });
      }
    }

    // Check 2: Overdue pending bookings (scheduled in the past, still pending)
    if (!checkType || checkType === 'overdue_bookings') {
      const overdueBookings = await this.db('bookings')
        .where(orgId ? { org_id: orgId } : {})
        .where('status', 'pending')
        .where('scheduled_at', '<', new Date())
        .select('id', 'client_id', 'lawyer_id', 'scheduled_at');

      for (const booking of overdueBookings) {
        findings.push({
          entity: 'booking',
          entityId: booking.id,
          issue: `Booking is overdue (scheduled ${booking.scheduled_at}) but still pending`,
          severity: 'high',
        });
      }
    }

    // Check 3: Unresolved disputes past deadline
    if (!checkType || checkType === 'expired_disputes') {
      const expiredDisputes = await this.db('disputes')
        .whereIn('status', ['pending', 'under_review'])
        .where('deadline_at', '<', new Date())
        .select('id', 'appellant_id', 'deadline_at');

      for (const dispute of expiredDisputes) {
        findings.push({
          entity: 'dispute',
          entityId: dispute.id,
          issue: `Dispute past deadline (${dispute.deadline_at}) still unresolved`,
          severity: 'high',
        });
      }
    }

    // Persist findings in job payload for review
    await this.db('jobs')
      .where({ id: job.id })
      .update({
        payload: JSON.stringify({
          ...job.payload,
          findings,
          findingsCount: findings.length,
          completedAt: new Date().toISOString(),
        }),
      });

    // Notify admins if there are high-severity findings
    const highSeverity = findings.filter(f => f.severity === 'high');
    if (highSeverity.length > 0 && orgId) {
      const admins = await this.db('users')
        .where({ org_id: orgId, role: 'admin', is_active: true })
        .select('id');

      const notifRepo = new KnexNotificationRepository(this.db);
      for (const admin of admins) {
        await notifRepo.create({
          userId: admin.id,
          title: 'Compliance Check: Issues Found',
          body: `${highSeverity.length} high-severity compliance issue(s) detected. Review the job results for details.`,
          type: 'system',
          referenceId: job.id,
        });
      }
    }

    logger.info({
      jobId: job.id,
      totalFindings: findings.length,
      highSeverity: highSeverity.length,
    }, 'Compliance check: completed');
  }
}
