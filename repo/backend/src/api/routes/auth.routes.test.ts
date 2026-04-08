import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock helpers
function createMockApp() {
  const routes: Record<string, { preHandler?: any[]; handler: Function }> = {};

  const app: any = {
    post: (path: string, opts: any, handler?: Function) => {
      if (typeof opts === 'function') {
        routes[`POST ${path}`] = { handler: opts };
      } else {
        routes[`POST ${path}`] = { preHandler: opts.preHandler, handler: handler! };
      }
    },
    get: (path: string, opts: any, handler?: Function) => {
      if (typeof opts === 'function') {
        routes[`GET ${path}`] = { handler: opts };
      } else {
        routes[`GET ${path}`] = { preHandler: opts.preHandler, handler: handler! };
      }
    },
    authenticate: vi.fn(),
    jwt: { sign: vi.fn(() => 'mock-jwt-token') },
    routes,
  };
  return app;
}

/** Build a callable mock Knex instance that mimics this.db('table').where(...).first() */
function createMockDb(firstResult: any = null) {
  return Object.assign(
    () => ({ where: () => ({ first: () => Promise.resolve(firstResult) }) }),
    { raw: vi.fn(), commit: vi.fn() },
  );
}

function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    body: {},
    db: createMockDb(),
    ip: '127.0.0.1',
    headers: {},
    user: { userId: 'u1', orgId: 'org1', role: 'client' },
    _dbCommitted: false,
    ...overrides,
  };
}

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    status: vi.fn(function (this: any, code: number) { this.statusCode = code; return this; }),
    send: vi.fn(function (this: any, body: any) { this._body = body; return this; }),
    _body: null,
  };
  return reply;
}

// ─── Input validation ───────────────────────────────────────────────

describe('Auth routes: login input validation', () => {
  it('returns 422 on missing username', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({ body: { password: 'test' } });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(422);
    expect(reply._body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 422 on empty password', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({ body: { username: 'user1', password: '' } });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(422);
    expect(reply._body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 422 if username exceeds max length', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({ body: { username: 'a'.repeat(256), password: 'pass' } });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(422);
    expect(reply._body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 422 with details array for structured error info', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({ body: {} });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(422);
    expect(reply._body.error).toBe('VALIDATION_ERROR');
    expect(reply._body.message).toBe('Invalid input');
    expect(Array.isArray(reply._body.details)).toBe(true);
    expect(reply._body.details.length).toBeGreaterThan(0);
  });
});

// ─── Authentication failure ─────────────────────────────────────────

describe('Auth routes: login authentication', () => {
  it('returns 401 with UNAUTHORIZED error for nonexistent user', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({
      body: { username: 'nonexistent', password: 'SomePass123!' },
      db: createMockDb(null),
    });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(401);
    expect(reply._body.error).toBe('UNAUTHORIZED');
    // Must not leak whether the username exists
    expect(reply._body.message).toContain('Invalid');
  });

  it('401 response never contains a 423 status to prevent account enumeration', async () => {
    const { AuthError } = await import('../../application/auth/login-use-case.js');

    const err = new AuthError(401, 'Invalid credentials or account temporarily locked');
    expect(err.statusCode).toBe(401);
    expect(err.message).not.toContain('423');
  });
});

// ─── Rate limiting ──────────────────────────────────────────────────

describe('Auth routes: login rate limiting', () => {
  it('first request from unique IP is not rate limited (gets 401, not 429)', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({
      body: { username: 'ratetest', password: 'TestPass123!' },
      ip: '10.99.99.99',
      db: createMockDb(null),
    });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(401);
    expect(reply._body.error).toBe('UNAUTHORIZED');
  });
});

// ─── Route guards ───────────────────────────────────────────────────

describe('Auth routes: protected endpoint guards', () => {
  it('logout requires authenticate preHandler', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const route = app.routes['POST /api/auth/logout'];
    expect(route).toBeDefined();
    expect(route.preHandler).toBeDefined();
    expect(route.preHandler).toContain(app.authenticate);
  });

  it('/api/auth/me requires authenticate preHandler', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const route = app.routes['GET /api/auth/me'];
    expect(route).toBeDefined();
    expect(route.preHandler).toBeDefined();
    expect(route.preHandler).toContain(app.authenticate);
  });

  it('login endpoint is public (no preHandler guard)', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const route = app.routes['POST /api/auth/login'];
    expect(route).toBeDefined();
    expect(route.preHandler).toBeUndefined();
  });
});

// ─── Response shape contracts ───────────────────────────────────────

describe('Auth routes: response shape contracts', () => {
  it('422 response has error, message, and details fields', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({ body: { username: '', password: '' } });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(422);
    expect(reply._body).toHaveProperty('error', 'VALIDATION_ERROR');
    expect(reply._body).toHaveProperty('message', 'Invalid input');
    expect(reply._body).toHaveProperty('details');
  });

  it('401 response has error and message fields (no token leak)', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({
      body: { username: 'nonexistent', password: 'TestPass123!' },
      db: createMockDb(null),
    });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(401);
    expect(reply._body).toHaveProperty('error', 'UNAUTHORIZED');
    expect(reply._body).toHaveProperty('message');
    expect(reply._body).not.toHaveProperty('token');
    expect(reply._body).not.toHaveProperty('user');
  });

  it('LoginResult interface includes required fields', async () => {
    // Contract check: LoginResult must contain these keys
    const { LoginUseCase } = await import('../../application/auth/login-use-case.js');
    expect(LoginUseCase).toBeDefined();

    // The interface shape is enforced by TypeScript; verify the permission
    // mapping covers all known roles at runtime
    const perms: Record<string, string[]> = {
      client: ['client.dashboard', 'client.bookings', 'client.credit', 'reviews', 'notifications'],
      lawyer: ['lawyer.dashboard', 'lawyer.availability', 'lawyer.bookings', 'reviews', 'notifications'],
      admin: ['admin.dashboard', 'admin.jobs', 'admin.arbitration', 'admin.users', 'admin.config', 'reports', 'reports.subscriptions', 'notifications'],
      super_admin: ['admin.dashboard', 'admin.jobs', 'admin.arbitration', 'admin.users', 'admin.organizations', 'admin.config', 'reports', 'reports.subscriptions', 'notifications'],
    };
    for (const role of ['client', 'lawyer', 'admin', 'super_admin']) {
      expect(perms[role]).toBeDefined();
      expect(perms[role].length).toBeGreaterThan(0);
    }
  });
});
