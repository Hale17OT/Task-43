import cron from 'node-cron';
import { Knex } from 'knex';
import { KnexJobRepository } from '../infrastructure/database/repositories/job-repository.js';
import { logger } from '../infrastructure/logging/index.js';

export class Scheduler {
  private tasks: cron.ScheduledTask[] = [];

  constructor(private db: Knex) {}

  start() {
    // 8:00 AM daily — generate report subscription notifications with jitter
    const reportTask = cron.schedule('0 8 * * *', async () => {
      logger.info('Running 8AM report subscription job generation');
      try {
        await this.generateReportJobs();
      } catch (err) {
        logger.error({ err }, 'Failed to generate report jobs');
      }
    });
    this.tasks.push(reportTask);

    // 2:00 AM daily — vacuum expired idempotency keys
    const vacuumTask = cron.schedule('0 2 * * *', async () => {
      logger.info('Running 2AM idempotency vacuum');
      try {
        const jobRepo = new KnexJobRepository(this.db);
        await jobRepo.enqueue({
          type: 'idempotency-vacuum',
          priority: 1,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to enqueue vacuum job');
      }
    });
    this.tasks.push(vacuumTask);

    logger.info('Scheduler started (8AM reports, 2AM vacuum)');
  }

  stop() {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    logger.info('Scheduler stopped');
  }

  private async generateReportJobs() {
    // Join subscriptions with users to get org_id for tenant scoping
    const subscriptions = await this.db('report_subscriptions')
      .join('users', 'report_subscriptions.user_id', 'users.id')
      .where({ 'report_subscriptions.is_active': true })
      .select('report_subscriptions.*', 'users.org_id');
    const jobRepo = new KnexJobRepository(this.db);

    for (const sub of subscriptions) {
      await jobRepo.enqueue({
        type: 'report-generation',
        payload: {
          userId: sub.user_id,
          reportType: sub.report_type,
          filters: sub.filters,
          subscriptionId: sub.id,
        },
        priority: 0,
        orgId: sub.org_id,
      });

      logger.info({ subscriptionId: sub.id }, 'Report job enqueued for immediate processing');
    }
  }
}
