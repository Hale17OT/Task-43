import { test, expect } from '@playwright/test';
import { getAuthToken } from './helpers';

/**
 * True no-mock HTTP coverage for GET /api/lawyers.
 *
 * The endpoint is the public lawyer directory used by clients when
 * creating bookings. It must be org-scoped, active-only, and must
 * never leak sensitive fields.
 */
test.describe('GET /api/lawyers — directory endpoint', () => {
  test('authenticated client can list lawyers with {data} envelope', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');

    const res = await page.request.get('/api/lawyers', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/application\/json/);

    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('returned lawyer rows expose only public fields (no password, no role, no credit, no lockout state)', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');

    const res = await page.request.get('/api/lawyers', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    for (const lawyer of body.data) {
      // Required public fields
      expect(typeof lawyer.id).toBe('string');
      expect(typeof lawyer.username).toBe('string');
      // dailyCapacity is nullable but must be present as a key
      expect(lawyer).toHaveProperty('dailyCapacity');

      // Sensitive/internal fields must not leak
      expect(lawyer).not.toHaveProperty('password');
      expect(lawyer).not.toHaveProperty('passwordHash');
      expect(lawyer).not.toHaveProperty('password_hash');
      expect(lawyer).not.toHaveProperty('failedLoginAttempts');
      expect(lawyer).not.toHaveProperty('failed_login_attempts');
      expect(lawyer).not.toHaveProperty('lockedUntil');
      expect(lawyer).not.toHaveProperty('locked_until');
      expect(lawyer).not.toHaveProperty('creditScore');
      expect(lawyer).not.toHaveProperty('credit_score');
      expect(lawyer).not.toHaveProperty('isActive');
      expect(lawyer).not.toHaveProperty('is_active');
      expect(lawyer).not.toHaveProperty('orgId');
      expect(lawyer).not.toHaveProperty('org_id');
      expect(lawyer).not.toHaveProperty('role');
    }
  });

  test('response is role-agnostic: admin, lawyer and client all see the same org-scoped set', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const adminToken = await getAuthToken(page, 'admin1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const forClient = await page.request.get('/api/lawyers', { headers: { Authorization: `Bearer ${clientToken}` } });
    const forAdmin = await page.request.get('/api/lawyers', { headers: { Authorization: `Bearer ${adminToken}` } });
    const forLawyer = await page.request.get('/api/lawyers', { headers: { Authorization: `Bearer ${lawyerToken}` } });

    expect(forClient.status()).toBe(200);
    expect(forAdmin.status()).toBe(200);
    expect(forLawyer.status()).toBe(200);

    const clientIds = ((await forClient.json()).data as any[]).map(l => l.id).sort();
    const adminIds = ((await forAdmin.json()).data as any[]).map(l => l.id).sort();
    const lawyerIds = ((await forLawyer.json()).data as any[]).map(l => l.id).sort();

    // Same organization → same visible set for all three roles.
    expect(clientIds).toEqual(adminIds);
    expect(clientIds).toEqual(lawyerIds);
  });

  test('unauthenticated request is rejected with 401', async ({ page }) => {
    const res = await page.request.get('/api/lawyers');
    expect(res.status()).toBe(401);
  });

  test('malformed bearer token is rejected with 401', async ({ page }) => {
    const res = await page.request.get('/api/lawyers', {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.status()).toBe(401);
  });

  test('returned lawyers match the seed set: includes the lawyer1 id and no non-lawyer ids', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');
    const adminToken = await getAuthToken(page, 'admin1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();
    const adminMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    const clientMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${clientToken}` },
    })).json();

    const res = await page.request.get('/api/lawyers', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const ids: string[] = body.data.map((l: any) => l.id);

    // Seed set: lawyer1 belongs to the same org and must be visible.
    expect(ids).toContain(lawyerMe.user.id);
    // Non-lawyer roles (admin, client) must NOT appear in the directory.
    expect(ids).not.toContain(adminMe.user.id);
    expect(ids).not.toContain(clientMe.user.id);
  });
});
