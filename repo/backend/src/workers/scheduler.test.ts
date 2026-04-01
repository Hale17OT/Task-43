import { describe, it, expect, vi } from 'vitest';

describe('Scheduler report job generation', () => {
  it('generates one job per active subscription immediately (no jitter)', async () => {
    const enqueuedJobs: any[] = [];

    const mockDb: any = (table: string) => {
      if (table === 'report_subscriptions') {
        return {
          join: () => ({
            where: () => ({
              select: () => Promise.resolve([
                { id: 'sub-1', user_id: 'user-1', report_type: 'utilization', filters: '{}', org_id: 'org-1' },
                { id: 'sub-2', user_id: 'user-2', report_type: 'fault_rate', filters: '{}', org_id: 'org-1' },
              ]),
            }),
          }),
        };
      }
      return {
        insert: (data: any) => ({
          returning: () => {
            enqueuedJobs.push(data);
            return Promise.resolve([{ id: `job-${enqueuedJobs.length}`, ...data }]);
          },
        }),
      };
    };
    mockDb.raw = async () => ({ rows: [] });

    const { Scheduler } = await import('./scheduler.js');
    const scheduler = new Scheduler(mockDb);
    await (scheduler as any).generateReportJobs();

    expect(enqueuedJobs.length).toBe(2);

    // Verify payload structure
    const job1Payload = JSON.parse(enqueuedJobs[0].payload);
    expect(job1Payload.userId).toBe('user-1');
    expect(job1Payload.reportType).toBe('utilization');
    expect(job1Payload.subscriptionId).toBe('sub-1');

    const job2Payload = JSON.parse(enqueuedJobs[1].payload);
    expect(job2Payload.userId).toBe('user-2');
    expect(job2Payload.reportType).toBe('fault_rate');

    // Verify org_id is populated
    expect(enqueuedJobs[0].org_id).toBe('org-1');
    expect(enqueuedJobs[1].org_id).toBe('org-1');

    // Verify shard_key is assigned
    expect(typeof enqueuedJobs[0].shard_key).toBe('number');

    // Verify no scheduledAt/jitter — jobs are immediate
    expect(enqueuedJobs[0].next_retry_at).toBeNull();
    expect(enqueuedJobs[1].next_retry_at).toBeNull();
  });

  it('generates no jobs when no active subscriptions exist', async () => {
    const enqueuedJobs: any[] = [];

    const mockDb: any = (table: string) => {
      if (table === 'report_subscriptions') {
        return {
          join: () => ({
            where: () => ({
              select: () => Promise.resolve([]),
            }),
          }),
        };
      }
      return {
        insert: (data: any) => ({
          returning: () => {
            enqueuedJobs.push(data);
            return Promise.resolve([{ id: 'job-1', ...data }]);
          },
        }),
      };
    };
    mockDb.raw = async () => ({ rows: [] });

    const { Scheduler } = await import('./scheduler.js');
    const scheduler = new Scheduler(mockDb);
    await (scheduler as any).generateReportJobs();

    expect(enqueuedJobs.length).toBe(0);
  });
});

describe('Scheduler cron schedule configuration', () => {
  it('uses 8:00 AM daily cron expression for report subscriptions', async () => {
    // Read the scheduler source to verify the cron expression directly
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname ?? '.', 'scheduler.ts'),
      'utf-8'
    );

    // Verify 8:00 AM cron for reports
    expect(source).toContain("'0 8 * * *'");
    // Verify 2:00 AM cron for vacuum
    expect(source).toContain("'0 2 * * *'");
  });
});
