import { describe, it, expect, vi } from 'vitest';
import { authorize } from './authorize.plugin.js';

/**
 * Direct unit tests for the `authorize` preHandler factory.
 *
 * The factory takes a variadic list of allowed roles and returns a
 * Fastify preHandler. The preHandler:
 *   - passes silently when request.user.role is in the allowed set
 *   - replies 403 with a structured error body otherwise
 */

function mockReply() {
  const reply: any = {
    statusCode: 0,
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(function (this: any, body: any) {
      this._body = body;
      return this;
    }),
    _body: null,
  };
  return reply;
}

function mockRequest(role: string) {
  return { user: { userId: 'u-1', orgId: 'o-1', role, nonce: 'n', jti: 'j' } } as any;
}

describe('authorize plugin — role-based preHandler', () => {
  it('returns a function (factory contract)', () => {
    const guard = authorize('admin');
    expect(typeof guard).toBe('function');
  });

  it('passes through (no reply) when role is in the allowed set', async () => {
    const guard = authorize('admin', 'super_admin');
    const reply = mockReply();
    const request = mockRequest('admin');

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('passes through when role matches the last of a long allow-list', async () => {
    const guard = authorize('client', 'lawyer', 'admin', 'super_admin');
    const reply = mockReply();
    const request = mockRequest('super_admin');

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('replies 403 with a FORBIDDEN envelope when role is not allowed', async () => {
    const guard = authorize('admin');
    const reply = mockReply();
    const request = mockRequest('client');

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply._body.error).toBe('FORBIDDEN');
    expect(typeof reply._body.message).toBe('string');
    expect(reply._body.message.length).toBeGreaterThan(0);
  });

  it('message enumerates the allowed roles so operators can diagnose', async () => {
    const guard = authorize('admin', 'super_admin');
    const reply = mockReply();
    const request = mockRequest('lawyer');

    await guard(request, reply);

    expect(reply.statusCode).toBe(403);
    expect(reply._body.message).toContain('admin');
    expect(reply._body.message).toContain('super_admin');
  });

  it('empty allow-list rejects every role', async () => {
    const guard = authorize();
    for (const role of ['client', 'lawyer', 'admin', 'super_admin']) {
      const reply = mockReply();
      const request = mockRequest(role);
      await guard(request, reply);
      expect(reply.statusCode).toBe(403);
    }
  });

  it('super_admin is NOT implicitly allowed — must be listed explicitly', async () => {
    const guard = authorize('admin');
    const reply = mockReply();
    const request = mockRequest('super_admin');

    await guard(request, reply);

    // authorize() is intentionally literal; it does not grant super_admin bypass.
    expect(reply.statusCode).toBe(403);
  });
});
