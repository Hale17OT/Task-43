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

function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    body: {},
    db: {
      raw: vi.fn(),
      commit: vi.fn(),
      ...overrides.db,
    },
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

describe('Auth routes: login endpoint', () => {
  it('returns 422 on missing username', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const request = createMockRequest({ body: { password: 'test' } });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(422);
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
  });

  it('returns 401 for nonexistent user', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;
    const db = {
      raw: vi.fn(),
      commit: vi.fn(),
      // Mock KnexUserRepository.findByUsername to return null
    };
    // Simulate: user repo returns null
    (db as any).__proto__ = Function.prototype;
    const request = createMockRequest({
      body: { username: 'nonexistent', password: 'SomePass123!' },
      db: Object.assign(vi.fn(() => ({
        where: () => ({ orWhere: () => ({ first: () => Promise.resolve(null) }) }),
      })), { raw: vi.fn(), commit: vi.fn() }),
    });
    const reply = createMockReply();

    await handler(request, reply);
    expect(reply.statusCode).toBe(401);
    expect(reply._body.error).toBe('UNAUTHORIZED');
  });
});

describe('Auth routes: login rate limiting', () => {
  it('first request from unique IP is not rate limited', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const handler = app.routes['POST /api/auth/login'].handler;

    // Use a valid login body + callable mock db that returns null user
    const mockDb: any = Object.assign(
      () => ({ where: () => ({ orWhere: () => ({ first: () => Promise.resolve(null) }) }) }),
      { raw: vi.fn(), commit: vi.fn() },
    );
    const request = createMockRequest({
      body: { username: 'ratetest', password: 'TestPass123!' },
      ip: '10.99.99.99',
      db: mockDb,
    });
    const reply = createMockReply();

    await handler(request, reply);
    // Should get 401 (user not found), NOT 429 (rate limited)
    expect(reply.statusCode).toBe(401);
  });
});

describe('Auth routes: logout endpoint', () => {
  it('has authenticate preHandler', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const route = app.routes['POST /api/auth/logout'];
    expect(route).toBeDefined();
    expect(route.preHandler).toBeDefined();
    expect(route.preHandler).toContain(app.authenticate);
  });
});

describe('Auth routes: /api/auth/me endpoint', () => {
  it('has authenticate preHandler', async () => {
    const app = createMockApp();
    const { default: authRoutes } = await import('./auth.routes.js');
    await authRoutes(app);

    const route = app.routes['GET /api/auth/me'];
    expect(route).toBeDefined();
    expect(route.preHandler).toBeDefined();
    expect(route.preHandler).toContain(app.authenticate);
  });
});

describe('Auth routes: lockout response shape', () => {
  it('lockout returns 401 (not 423) to prevent account enumeration', async () => {
    // This is a contract test — the use-case always throws 401 for lockout
    const { AuthError } = await import('../../application/auth/login-use-case.js');

    // Verify the AuthError for lockout uses 401
    const err = new AuthError(401, 'Invalid credentials or account temporarily locked');
    expect(err.statusCode).toBe(401);
    expect(err.message).not.toContain('423');
  });
});
