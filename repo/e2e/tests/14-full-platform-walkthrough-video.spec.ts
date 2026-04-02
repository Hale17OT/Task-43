import { test, expect, Page } from '@playwright/test';
import { login, logout, waitForShell } from './helpers';

test.use({ video: 'on' });

async function apiLogin(page: Page, username: string) {
  const res = await page.request.post('/api/auth/login', {
    data: { username, password: 'SecurePass1!' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return {
    token: body.token as string,
    user: body.user as { id: string; orgId: string; role: string },
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test('platform walkthrough records one full feature video', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  const ids: Record<string, string> = {};
  const suffix = Date.now().toString();

  await test.step('Public endpoints', async () => {
    const health = await page.request.get('/api/health');
    expect(health.ok()).toBe(true);

    const time = await page.request.get('/api/time');
    expect(time.ok()).toBe(true);
  });

  await test.step('Login roles for API work', async () => {
    const superAdmin = await apiLogin(page, 'superadmin');
    ids.superToken = superAdmin.token;
    ids.superOrgId = superAdmin.user.orgId;

    const admin = await apiLogin(page, 'admin1');
    ids.adminToken = admin.token;

    const lawyer = await apiLogin(page, 'lawyer1');
    ids.lawyerToken = lawyer.token;
    ids.lawyerId = lawyer.user.id;

    const client = await apiLogin(page, 'client1');
    ids.clientToken = client.token;
    ids.clientId = client.user.id;
  });

  await test.step('Organizations + users API', async () => {
    const orgCreate = await page.request.post('/api/organizations', {
      headers: auth(ids.superToken),
      data: { name: `Walkthrough Org ${suffix}`, settings: { source: 'playwright' } },
    });
    expect(orgCreate.status()).toBe(201);
    ids.orgId = (await orgCreate.json()).organization.id;

    const orgList = await page.request.get('/api/organizations?page=1&limit=20', {
      headers: auth(ids.superToken),
    });
    expect(orgList.ok()).toBe(true);

    const orgPatch = await page.request.patch(`/api/organizations/${ids.orgId}`, {
      headers: auth(ids.superToken),
      data: { name: `Walkthrough Org ${suffix} Updated` },
    });
    expect(orgPatch.ok()).toBe(true);

    const userCreate = await page.request.post('/api/users', {
      headers: auth(ids.superToken),
      data: {
        username: `walk_user_${suffix}`,
        password: 'WalkthroughPass1!@#',
        role: 'client',
        orgId: ids.superOrgId,
      },
    });
    expect(userCreate.status()).toBe(201);
    ids.tempUserId = (await userCreate.json()).user.id;

    const users = await page.request.get('/api/users?page=1&limit=20', {
      headers: auth(ids.adminToken),
    });
    expect(users.ok()).toBe(true);

    const userPatch = await page.request.patch(`/api/users/${ids.tempUserId}`, {
      headers: auth(ids.superToken),
      data: { isActive: true },
    });
    expect(userPatch.ok()).toBe(true);
  });

  await test.step('Availability API', async () => {
    const create = await page.request.post('/api/availability', {
      headers: auth(ids.lawyerToken),
      data: {
        dayOfWeek: 6,
        startTime: '23:00',
        endTime: '23:30',
        slotDurationMin: 30,
      },
    });
    expect(create.status()).toBe(201);
    ids.availabilityId = (await create.json()).slot.id;

    const list = await page.request.get(`/api/availability?lawyerId=${ids.lawyerId}`, {
      headers: auth(ids.clientToken),
    });
    expect(list.ok()).toBe(true);

    const update = await page.request.patch(`/api/availability/${ids.availabilityId}`, {
      headers: auth(ids.lawyerToken),
      data: { isActive: true, startTime: '22:30', endTime: '23:00' },
    });
    expect(update.ok()).toBe(true);

    const del = await page.request.delete(`/api/availability/${ids.availabilityId}`, {
      headers: auth(ids.lawyerToken),
    });
    expect(del.status()).toBe(204);
  });

  await test.step('Booking lifecycle API coverage', async () => {
    const now = Date.now();

    const create1 = await page.request.post('/api/bookings', {
      headers: auth(ids.clientToken),
      data: {
        lawyerId: ids.lawyerId,
        type: 'consultation',
        scheduledAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(create1.status()).toBe(201);
    ids.bookingCompleteId = (await create1.json()).booking.id;

    const create2 = await page.request.post('/api/bookings', {
      headers: auth(ids.clientToken),
      data: {
        lawyerId: ids.lawyerId,
        type: 'consultation',
        scheduledAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(create2.status()).toBe(201);
    ids.bookingDeclineId = (await create2.json()).booking.id;

    const create3 = await page.request.post('/api/bookings', {
      headers: auth(ids.clientToken),
      data: {
        lawyerId: ids.lawyerId,
        type: 'consultation',
        scheduledAt: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(create3.status()).toBe(201);
    ids.bookingCancelId = (await create3.json()).booking.id;

    const create4 = await page.request.post('/api/bookings', {
      headers: auth(ids.clientToken),
      data: {
        lawyerId: ids.lawyerId,
        type: 'consultation',
        scheduledAt: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(create4.status()).toBe(201);
    ids.bookingRescheduleId = (await create4.json()).booking.id;

    const create5 = await page.request.post('/api/bookings', {
      headers: auth(ids.clientToken),
      data: {
        lawyerId: ids.lawyerId,
        type: 'consultation',
        scheduledAt: new Date(now - 20 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(create5.status()).toBe(201);
    ids.bookingNoShowId = (await create5.json()).booking.id;

    expect((await page.request.patch(`/api/bookings/${ids.bookingCompleteId}/confirm`, { headers: auth(ids.lawyerToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/bookings/${ids.bookingDeclineId}/decline`, { headers: auth(ids.lawyerToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/bookings/${ids.bookingCancelId}/confirm`, { headers: auth(ids.lawyerToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/bookings/${ids.bookingRescheduleId}/confirm`, { headers: auth(ids.lawyerToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/bookings/${ids.bookingNoShowId}/confirm`, { headers: auth(ids.lawyerToken) })).ok()).toBe(true);

    expect((await page.request.patch(`/api/bookings/${ids.bookingCompleteId}/complete`, { headers: auth(ids.lawyerToken) })).ok()).toBe(true);

    const cancelRes = await page.request.patch(`/api/bookings/${ids.bookingCancelId}/cancel`, {
      headers: auth(ids.clientToken),
      data: { reason: 'Walkthrough cancellation' },
    });
    expect(cancelRes.ok()).toBe(true);

    const rescheduleRes = await page.request.patch(`/api/bookings/${ids.bookingRescheduleId}/reschedule`, {
      headers: auth(ids.clientToken),
      data: {
        newScheduledAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(rescheduleRes.status()).toBe(201);

    const noShowRes = await page.request.patch(`/api/bookings/${ids.bookingNoShowId}/no-show`, {
      headers: auth(ids.lawyerToken),
    });
    expect(noShowRes.ok()).toBe(true);

    const bookingList = await page.request.get('/api/bookings?page=1&limit=20', {
      headers: auth(ids.clientToken),
    });
    expect(bookingList.ok()).toBe(true);

    const bookingGet = await page.request.get(`/api/bookings/${ids.bookingCompleteId}`, {
      headers: auth(ids.clientToken),
    });
    expect(bookingGet.ok()).toBe(true);
  });

  await test.step('Reviews, disputes, credit, notifications API', async () => {
    const clientReview = await page.request.post('/api/reviews', {
      headers: auth(ids.clientToken),
      data: {
        bookingId: ids.bookingCompleteId,
        timeliness: 5,
        professionalism: 5,
        communication: 5,
        comment: 'Walkthrough client review',
      },
    });
    expect(clientReview.status()).toBe(201);
    ids.reviewId = (await clientReview.json()).review.id;

    const lawyerReview = await page.request.post('/api/reviews', {
      headers: auth(ids.lawyerToken),
      data: {
        bookingId: ids.bookingCompleteId,
        timeliness: 4,
        professionalism: 4,
        communication: 4,
        comment: 'Walkthrough lawyer review',
      },
    });
    expect(lawyerReview.status()).toBe(201);

    const reviews = await page.request.get(`/api/reviews?bookingId=${ids.bookingCompleteId}`, {
      headers: auth(ids.clientToken),
    });
    expect(reviews.ok()).toBe(true);

    const dispute = await page.request.post('/api/disputes', {
      headers: auth(ids.lawyerToken),
      data: {
        reviewId: ids.reviewId,
        reason: 'This is a walkthrough dispute for exercising arbitration flow',
      },
    });
    expect(dispute.status()).toBe(201);
    ids.disputeId = (await dispute.json()).dispute.id;

    const disputes = await page.request.get('/api/disputes?page=1&limit=20', {
      headers: auth(ids.adminToken),
    });
    expect(disputes.ok()).toBe(true);

    const resolve = await page.request.patch(`/api/disputes/${ids.disputeId}/resolve`, {
      headers: auth(ids.adminToken),
      data: { resolution: 'upheld', notes: 'Walkthrough resolution' },
    });
    expect(resolve.ok()).toBe(true);

    const creditSelf = await page.request.get(`/api/credit/${ids.clientId}`, {
      headers: auth(ids.clientToken),
    });
    expect(creditSelf.ok()).toBe(true);

    const creditAdmin = await page.request.get(`/api/credit/${ids.clientId}`, {
      headers: auth(ids.adminToken),
    });
    expect(creditAdmin.ok()).toBe(true);

    const notifList = await page.request.get('/api/notifications?page=1&limit=20', {
      headers: auth(ids.clientToken),
    });
    expect(notifList.ok()).toBe(true);
    const notifBody = await notifList.json();
    if (notifBody.data && notifBody.data.length > 0) {
      const notifId = notifBody.data[0].id;
      const markRead = await page.request.patch(`/api/notifications/${notifId}/read`, {
        headers: auth(ids.clientToken),
      });
      expect(markRead.ok()).toBe(true);
    }
    const markAll = await page.request.patch('/api/notifications/read-all', {
      headers: auth(ids.clientToken),
    });
    expect(markAll.status()).toBe(204);
  });

  await test.step('Reports, jobs, admin, webhooks, config API', async () => {
    const dashboard = await page.request.get('/api/reports/dashboard', {
      headers: auth(ids.adminToken),
    });
    expect(dashboard.ok()).toBe(true);

    const exportCsv = await page.request.get('/api/reports/export?format=csv', {
      headers: auth(ids.adminToken),
    });
    expect(exportCsv.ok()).toBe(true);

    const exportXlsx = await page.request.get('/api/reports/export?format=xlsx', {
      headers: auth(ids.adminToken),
    });
    expect(exportXlsx.ok()).toBe(true);

    const subCreate = await page.request.post('/api/report-subscriptions', {
      headers: auth(ids.adminToken),
      data: { reportType: 'walkthrough', filters: { role: 'lawyer' } },
    });
    expect(subCreate.status()).toBe(201);
    ids.subId = (await subCreate.json()).subscription.id;

    expect((await page.request.get('/api/report-subscriptions', { headers: auth(ids.adminToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/report-subscriptions/${ids.subId}`, {
      headers: auth(ids.adminToken),
      data: { isActive: true },
    })).ok()).toBe(true);
    expect((await page.request.delete(`/api/report-subscriptions/${ids.subId}`, {
      headers: auth(ids.adminToken),
    })).status()).toBe(204);

    const jobs = await page.request.get('/api/jobs?page=1&limit=20', {
      headers: auth(ids.adminToken),
    });
    expect(jobs.ok()).toBe(true);
    const jobsBody = await jobs.json();
    if (jobsBody.data && jobsBody.data.length > 0) {
      const jobById = await page.request.get(`/api/jobs/${jobsBody.data[0].id}`, {
        headers: auth(ids.adminToken),
      });
      expect(jobById.ok()).toBe(true);
    }

    expect((await page.request.get('/api/admin/system-status', { headers: auth(ids.adminToken) })).ok()).toBe(true);
    expect((await page.request.post('/api/admin/confirm-key-backup', { headers: auth(ids.superToken) })).ok()).toBe(true);

    const audit = await page.request.get('/api/admin/audit-log?page=1&limit=20', {
      headers: auth(ids.superToken),
    });
    expect(audit.ok()).toBe(true);

    const webhookCreate = await page.request.post('/api/webhooks', {
      headers: auth(ids.adminToken),
      data: {
        url: 'https://example.com/webhook',
        events: ['booking.created', 'booking.completed'],
        secret: `walkthroughSecret_${suffix}`,
      },
    });
    expect(webhookCreate.status()).toBe(201);
    ids.webhookId = (await webhookCreate.json()).webhook.id;

    expect((await page.request.get('/api/webhooks', { headers: auth(ids.adminToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/webhooks/${ids.webhookId}`, {
      headers: auth(ids.adminToken),
      data: { url: 'https://example.com/webhook-updated', isActive: true },
    })).ok()).toBe(true);
    expect((await page.request.post(`/api/webhooks/${ids.webhookId}/rotate-secret`, {
      headers: auth(ids.adminToken),
      data: { secret: `walkthroughSecret_rotated_${suffix}` },
    })).ok()).toBe(true);

    const dictCreate = await page.request.post('/api/config/dictionaries', {
      headers: auth(ids.adminToken),
      data: {
        category: 'matter_type',
        key: `walk_${suffix}`,
        value: { label: 'Walkthrough', active: true },
      },
    });
    expect(dictCreate.status()).toBe(201);
    ids.dictId = (await dictCreate.json()).entry.id;

    expect((await page.request.get('/api/config/dictionaries', { headers: auth(ids.adminToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/config/dictionaries/${ids.dictId}`, {
      headers: auth(ids.adminToken),
      data: { value: { label: 'Walkthrough Updated', active: true } },
    })).ok()).toBe(true);
    expect((await page.request.delete(`/api/config/dictionaries/${ids.dictId}`, {
      headers: auth(ids.adminToken),
    })).status()).toBe(204);

    const stepCreate = await page.request.post('/api/config/workflow-steps', {
      headers: auth(ids.adminToken),
      data: {
        workflowType: 'intake',
        stepOrder: 99,
        name: 'Walkthrough Step',
        config: { required: false },
      },
    });
    expect(stepCreate.status()).toBe(201);
    ids.stepId = (await stepCreate.json()).step.id;

    expect((await page.request.get('/api/config/workflow-steps', { headers: auth(ids.adminToken) })).ok()).toBe(true);
    expect((await page.request.patch(`/api/config/workflow-steps/${ids.stepId}`, {
      headers: auth(ids.adminToken),
      data: { name: 'Walkthrough Step Updated', stepOrder: 100 },
    })).ok()).toBe(true);
    expect((await page.request.delete(`/api/config/workflow-steps/${ids.stepId}`, {
      headers: auth(ids.adminToken),
    })).status()).toBe(204);
  });

  await test.step('UI walkthrough by role (client, lawyer, admin, super_admin)', async () => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    await login(page, 'client1');
    await waitForShell(page);
    await page.click('a[href="/client/bookings"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/client/bookings/create"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/client/credit-history"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/reviews"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/notifications"]');
    await page.waitForTimeout(600);
    await logout(page);

    await login(page, 'lawyer1');
    await waitForShell(page);
    await page.click('a[href="/lawyer/availability"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/lawyer/bookings"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/reviews"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/notifications"]');
    await page.waitForTimeout(600);
    await logout(page);

    await login(page, 'admin1');
    await waitForShell(page);
    await page.click('a[href="/admin/jobs"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/admin/arbitration"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/admin/users"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/admin/config"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/reports"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/reports/subscriptions"]');
    await page.waitForTimeout(600);
    await page.click('a[href="/notifications"]');
    await page.waitForTimeout(600);
    await logout(page);

    await login(page, 'superadmin');
    await waitForShell(page);
    await page.click('a[href="/admin/organizations"]');
    await page.waitForTimeout(1000);
    await logout(page);
  });

  await test.step('Cleanup temp user', async () => {
    const freshSuper = await apiLogin(page, 'superadmin');
    const del = await page.request.delete(`/api/users/${ids.tempUserId}`, {
      headers: auth(freshSuper.token),
    });
    expect(del.status()).toBe(204);

    const logoutRes = await page.request.post('/api/auth/logout', {
      headers: auth(freshSuper.token),
    });
    expect([204, 401]).toContain(logoutRes.status());
  });
});
