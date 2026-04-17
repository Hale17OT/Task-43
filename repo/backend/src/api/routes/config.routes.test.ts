import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import configRoutes from './config.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const ORG_2 = 'a0000000-0000-0000-0000-000000000002';
const DICT_GLOBAL = 'd0000000-0000-0000-0000-000000000001';
const DICT_ORG1 = 'd0000000-0000-0000-0000-000000000002';
const DICT_ORG2 = 'd0000000-0000-0000-0000-000000000003';
const STEP_GLOBAL = 'f0000000-0000-0000-0000-000000000001';
const STEP_ORG1 = 'f0000000-0000-0000-0000-000000000002';
const STEP_ORG2 = 'f0000000-0000-0000-0000-000000000003';

describe('Config dictionary routes — authorization & org scoping', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    config_dictionaries: [
      { id: DICT_GLOBAL, org_id: null, category: 'matter_type', key: 'global_k', value: { label: 'G' }, created_at: new Date() },
      { id: DICT_ORG1, org_id: ORG_1, category: 'matter_type', key: 'org1_k', value: { label: 'O1' }, created_at: new Date() },
      { id: DICT_ORG2, org_id: ORG_2, category: 'matter_type', key: 'org2_k', value: { label: 'O2' }, created_at: new Date() },
    ],
    workflow_steps: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [configRoutes] });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    clientToken = signTestToken(app, mockData, { userId: 'c-1', orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/config/dictionaries rejects unauthenticated (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config/dictionaries' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/config/dictionaries rejects client (403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/config/dictionaries',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin sees own-org + global entries, NOT other orgs', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/config/dictionaries',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const ids = body.data.map((d: any) => d.id);
    expect(ids).toContain(DICT_GLOBAL);
    expect(ids).toContain(DICT_ORG1);
    expect(ids).not.toContain(DICT_ORG2);
  });

  it('POST /api/config/dictionaries (admin) creates an org-scoped entry (201)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/config/dictionaries',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { category: 'priority', key: 'urgent', value: { label: 'Urgent', order: 1 } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.entry).toBeDefined();
    expect(body.entry.id).toBeDefined();
    expect(body.entry.category).toBe('priority');
    expect(body.entry.key).toBe('urgent');
    // admin-created entries must be scoped to own org, not global
    expect(body.entry.org_id).toBe(ORG_1);
  });

  it('POST /api/config/dictionaries (super_admin) creates a global entry (org_id=null)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/config/dictionaries',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { category: 'priority', key: 'global_urgent', value: { label: 'Urgent' } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.entry.org_id).toBeNull();
  });

  it('POST /api/config/dictionaries rejects missing category (422)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/config/dictionaries',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: 'incomplete', value: { x: 1 } },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH /api/config/dictionaries/:id cannot touch another org\'s entry (404)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/config/dictionaries/${DICT_ORG2}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: { label: 'Hacked' } },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/config/dictionaries/:id updates own-org entry (200)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/config/dictionaries/${DICT_ORG1}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: { label: 'Updated' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.entry).toBeDefined();
  });

  it('DELETE /api/config/dictionaries/:id (own-org) returns 204', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/config/dictionaries/${DICT_ORG1}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/config/dictionaries/:id cross-org returns 404', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/config/dictionaries/${DICT_ORG2}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Workflow step routes — authorization & validation', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    config_dictionaries: [],
    workflow_steps: [
      { id: STEP_GLOBAL, org_id: null, workflow_type: 'intake', step_order: 1, name: 'Global', config: {} },
      { id: STEP_ORG1, org_id: ORG_1, workflow_type: 'intake', step_order: 2, name: 'Org1 Step', config: {} },
      { id: STEP_ORG2, org_id: ORG_2, workflow_type: 'intake', step_order: 3, name: 'Org2 Step', config: {} },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [configRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    clientToken = signTestToken(app, mockData, { userId: 'c-1', orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/config/workflow-steps rejects client (403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/config/workflow-steps',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin lists own-org + global workflow steps (no other-org leakage)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/config/workflow-steps',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const ids = body.data.map((s: any) => s.id);
    expect(ids).toContain(STEP_GLOBAL);
    expect(ids).toContain(STEP_ORG1);
    expect(ids).not.toContain(STEP_ORG2);
  });

  it('POST /api/config/workflow-steps creates org-scoped step with required fields (201)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/config/workflow-steps',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { workflowType: 'matter', stepOrder: 1, name: 'Kickoff', config: { required: true } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.step.name).toBe('Kickoff');
    expect(body.step.workflow_type).toBe('matter');
    expect(body.step.step_order).toBe(1);
    expect(body.step.org_id).toBe(ORG_1);
  });

  it('POST /api/config/workflow-steps super_admin creates a global step (org_id=null)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/config/workflow-steps',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { workflowType: 'matter', stepOrder: 2, name: 'Global Step' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.step.org_id).toBeNull();
  });

  it('POST /api/config/workflow-steps validates stepOrder non-negative (422)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/config/workflow-steps',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { workflowType: 'matter', stepOrder: -1, name: 'Bad' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH /api/config/workflow-steps/:id other-org returns 404', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/config/workflow-steps/${STEP_ORG2}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(404);
  });
});
