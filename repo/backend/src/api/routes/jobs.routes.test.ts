import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import jobRoutes from './jobs.routes.js';

describe('GET /api/jobs — real route handler', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    jobs: [
      {
        id: 'job-1', type: 'report-generation', payload: '{}', priority: 0,
        status: 'completed', attempts: 1, max_attempts: 5, next_retry_at: null,
        last_error: null, shard_key: 0, idempotency_key: null, locked_by: null,
        org_id: 'org-1',
        created_at: new Date('2025-01-01T00:00:00Z'),
        started_at: new Date('2025-01-01T00:00:02Z'),
        completed_at: new Date('2025-01-01T00:00:05Z'),
      },
      {
        id: 'job-2', type: 'idempotency-vacuum', payload: '{}', priority: 1,
        status: 'completed', attempts: 1, max_attempts: 5, next_retry_at: null,
        last_error: null, shard_key: 1, idempotency_key: null, locked_by: null,
        org_id: 'org-2',
        created_at: new Date('2025-01-01T00:00:00Z'),
        started_at: new Date('2025-01-01T00:00:10Z'),
        completed_at: new Date('2025-01-01T00:00:15Z'),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [jobRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: 'org-1', role: 'admin' });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: 'org-1', role: 'super_admin' });
    clientToken = signTestToken(app, mockData, { userId: 'c-1', orgId: 'org-1', role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('includes latencyMs in job list response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
    // job-1: started 2s after created
    const job1 = body.data.find((j: any) => j.id === 'job-1');
    expect(job1).toBeDefined();
    expect(job1.latencyMs).toBe(2000);
  });

  it('admin sees only their org jobs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Admin is org-1, should only see job-1
    for (const job of body.data) {
      expect(job.orgId).toBe('org-1');
    }
  });

  it('super_admin sees all jobs across orgs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
  });

  it('client cannot access job monitor (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/jobs/:id returns latencyMs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.job.latencyMs).toBe(2000);
  });

  it('admin cannot view cross-org job by ID (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-2',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
