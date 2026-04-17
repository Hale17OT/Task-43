import { describe, it, expect } from 'vitest';
import { buildTestApp, MockDbData } from '../test-helpers.js';

/**
 * Org-isolation plugin contract.
 *
 * The production plugin (`src/api/plugins/org-isolation.plugin.ts`)
 * attaches a per-request Knex transaction at `request.db`, initializes
 * `app.bypass_rls = 'false'`, and commits on success / rolls back on
 * error. The test harness mirrors the `request.db` contract so route
 * tests can rely on it uniformly; these tests lock that contract down.
 */

describe('org-isolation plugin — per-request db context', () => {
  it('attaches `request.db` to every handled request', async () => {
    const mockData: MockDbData = {};
    let seenDb: unknown = null;

    const app = await buildTestApp({
      mockData,
      routes: [async (a) => {
        a.get('/probe-db', async (request) => {
          seenDb = request.db;
          return { ok: true };
        });
      }],
    });

    const res = await app.inject({ method: 'GET', url: '/probe-db' });
    expect(res.statusCode).toBe(200);
    expect(seenDb).not.toBeNull();
    // Mirrors the plugin: db is callable like a Knex instance.
    expect(typeof seenDb).toBe('function');
    expect(typeof (seenDb as any).raw).toBe('function');

    await app.close();
  });

  it('request.db is independent per request (no cross-request state leak)', async () => {
    const mockData: MockDbData = {};
    const observed: unknown[] = [];

    const app = await buildTestApp({
      mockData,
      routes: [async (a) => {
        a.get('/probe-db', async (request) => {
          observed.push(request.db);
          return { ok: true };
        });
      }],
    });

    await app.inject({ method: 'GET', url: '/probe-db' });
    await app.inject({ method: 'GET', url: '/probe-db' });

    expect(observed.length).toBe(2);
    // The plugin creates a fresh transaction per request.
    // (In the mock, each onRequest hook calls createMockDb() anew.)
    expect(observed[0]).not.toBe(observed[1]);

    await app.close();
  });

  it('mutations via request.db in one request are visible to later requests (shared mock store)', async () => {
    // Sanity: mocked store persists across requests, so routes can
    // read back data written by the previous request.
    const mockData: MockDbData = { widgets: [] };

    const app = await buildTestApp({
      mockData,
      routes: [async (a) => {
        a.post('/widgets', async (request) => {
          const db: any = request.db;
          await db('widgets').insert({ id: 'w-1', name: 'first' });
          return { ok: true };
        });
        a.get('/widgets', async (request) => {
          const db: any = request.db;
          const row = await db('widgets').where({ id: 'w-1' }).first();
          return { widget: row };
        });
      }],
    });

    const post = await app.inject({ method: 'POST', url: '/widgets' });
    expect(post.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: '/widgets' });
    expect(get.statusCode).toBe(200);
    const body = JSON.parse(get.payload);
    expect(body.widget?.id).toBe('w-1');
    expect(body.widget?.name).toBe('first');

    await app.close();
  });
});
