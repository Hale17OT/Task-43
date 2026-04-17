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
    expect(health.status()).toBe(200);
    const healthBody = await health.json();
    expect(healthBody.status).toBe('ok');

    const time = await page.request.get('/api/time');
    expect(time.status()).toBe(200);
    const timeBody = await time.json();
    expect(typeof timeBody.serverTime).toBe('string');
    expect(Number.isNaN(Date.parse(timeBody.serverTime))).toBe(false);
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
    expect(orgList.status()).toBe(200);
    const orgListBody = await orgList.json();
    expect(Array.isArray(orgListBody.data)).toBe(true);
    expect(typeof orgListBody.total).toBe('number');
    expect(orgListBody.data.some((o: any) => o.id === ids.orgId)).toBe(true);

    const orgPatch = await page.request.patch(`/api/organizations/${ids.orgId}`, {
      headers: auth(ids.superToken),
      data: { name: `Walkthrough Org ${suffix} Updated` },
    });
    expect(orgPatch.status()).toBe(200);
    const orgPatchBody = await orgPatch.json();
    expect(orgPatchBody.organization.name).toBe(`Walkthrough Org ${suffix} Updated`);
    expect(orgPatchBody.organization.id).toBe(ids.orgId);

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
    const userCreateBody = await userCreate.json();
    expect(userCreateBody.user.username).toBe(`walk_user_${suffix}`);
    expect(userCreateBody.user.role).toBe('client');
    expect(userCreateBody.user).not.toHaveProperty('passwordHash');
    expect(userCreateBody.user).not.toHaveProperty('password_hash');
    ids.tempUserId = userCreateBody.user.id;

    const users = await page.request.get('/api/users?page=1&limit=20', {
      headers: auth(ids.adminToken),
    });
    expect(users.status()).toBe(200);
    const usersBody = await users.json();
    expect(Array.isArray(usersBody.data)).toBe(true);
    for (const u of usersBody.data) {
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('password_hash');
      expect(u).not.toHaveProperty('failed_login_attempts');
    }

    const userPatch = await page.request.patch(`/api/users/${ids.tempUserId}`, {
      headers: auth(ids.superToken),
      data: { isActive: true },
    });
    expect(userPatch.status()).toBe(200);
    const userPatchBody = await userPatch.json();
    expect(userPatchBody.user.id).toBe(ids.tempUserId);
    expect(userPatchBody.user.isActive).toBe(true);
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
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    expect(Array.isArray(listBody.slots)).toBe(true);
    expect(listBody.slots.some((s: any) => s.id === ids.availabilityId)).toBe(true);

    // Client-facing lawyer directory (public fields only, org-scoped)
    const lawyers = await page.request.get('/api/lawyers', {
      headers: auth(ids.clientToken),
    });
    expect(lawyers.status()).toBe(200);
    const lawyersBody = await lawyers.json();
    expect(Array.isArray(lawyersBody.data)).toBe(true);
    expect(lawyersBody.data.some((l: any) => l.id === ids.lawyerId)).toBe(true);
    for (const l of lawyersBody.data) {
      expect(l).toHaveProperty('id');
      expect(l).toHaveProperty('username');
      expect(l).toHaveProperty('dailyCapacity');
      expect(l).not.toHaveProperty('password_hash');
      expect(l).not.toHaveProperty('role');
      expect(l).not.toHaveProperty('credit_score');
    }

    const update = await page.request.patch(`/api/availability/${ids.availabilityId}`, {
      headers: auth(ids.lawyerToken),
      data: { isActive: true, startTime: '22:30', endTime: '23:00' },
    });
    expect(update.status()).toBe(200);
    const updateBody = await update.json();
    // Postgres TIME columns serialize as HH:MM:SS — match prefix.
    expect(updateBody.slot.startTime).toMatch(/^22:30(:00)?$/);
    expect(updateBody.slot.endTime).toMatch(/^23:00(:00)?$/);
    expect(updateBody.slot.isActive).toBe(true);

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

    // Verify each state transition lands the booking in the expected status.
    async function patchAndAssertStatus(
      bookingId: string, action: string, token: string,
      expectedStatus: string, data?: any,
    ) {
      const r = await page.request.patch(`/api/bookings/${bookingId}/${action}`, {
        headers: auth(token),
        ...(data ? { data } : {}),
      });
      expect(r.status(), `action=${action} body=${await r.text()}`).toBeGreaterThanOrEqual(200);
      expect(r.status()).toBeLessThan(300);
      const body = await r.json();
      expect(body.booking).toBeDefined();
      expect(body.booking.id).toBe(bookingId);
      expect(body.booking.status).toBe(expectedStatus);
      return body.booking;
    }

    await patchAndAssertStatus(ids.bookingCompleteId, 'confirm', ids.lawyerToken, 'confirmed');
    await patchAndAssertStatus(ids.bookingDeclineId, 'decline', ids.lawyerToken, 'declined');
    await patchAndAssertStatus(ids.bookingCancelId, 'confirm', ids.lawyerToken, 'confirmed');
    await patchAndAssertStatus(ids.bookingRescheduleId, 'confirm', ids.lawyerToken, 'confirmed');
    await patchAndAssertStatus(ids.bookingNoShowId, 'confirm', ids.lawyerToken, 'confirmed');

    await patchAndAssertStatus(ids.bookingCompleteId, 'complete', ids.lawyerToken, 'completed');

    const cancelled = await patchAndAssertStatus(
      ids.bookingCancelId, 'cancel', ids.clientToken, 'cancelled',
      { reason: 'Walkthrough cancellation' },
    );
    // The raw reason is stored encrypted (cancellationReasonEnc); assert the payload exists
    // and does not leak the plaintext cancellation reason in the response.
    expect(JSON.stringify(cancelled)).not.toContain('Walkthrough cancellation');

    const rescheduleRes = await page.request.patch(`/api/bookings/${ids.bookingRescheduleId}/reschedule`, {
      headers: auth(ids.clientToken),
      data: {
        newScheduledAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(rescheduleRes.status()).toBe(201);
    const rescheduleBody = await rescheduleRes.json();
    // Reschedule creates a new booking (pending) and marks the old one rescheduled;
    // the response envelope is `{ newBooking }`.
    expect(rescheduleBody.newBooking).toBeDefined();
    expect(rescheduleBody.newBooking.id).not.toBe(ids.bookingRescheduleId);
    expect(rescheduleBody.newBooking.status).toBe('pending');

    await patchAndAssertStatus(ids.bookingNoShowId, 'no-show', ids.lawyerToken, 'no_show');

    const bookingList = await page.request.get('/api/bookings?page=1&limit=20', {
      headers: auth(ids.clientToken),
    });
    expect(bookingList.status()).toBe(200);
    const bookingListBody = await bookingList.json();
    expect(Array.isArray(bookingListBody.data)).toBe(true);
    expect(typeof bookingListBody.total).toBe('number');
    // client must only see own bookings (role-scoped filter in route)
    for (const b of bookingListBody.data) {
      expect(b.clientId).toBe(ids.clientId);
    }

    const bookingGet = await page.request.get(`/api/bookings/${ids.bookingCompleteId}`, {
      headers: auth(ids.clientToken),
    });
    expect(bookingGet.status()).toBe(200);
    const bookingGetBody = await bookingGet.json();
    expect(bookingGetBody.booking.id).toBe(ids.bookingCompleteId);
    expect(bookingGetBody.booking.status).toBe('completed');
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
    expect(reviews.status()).toBe(200);
    const reviewsBody = await reviews.json();
    expect(Array.isArray(reviewsBody.data)).toBe(true);
    expect(reviewsBody.data.length).toBeGreaterThanOrEqual(2);
    for (const r of reviewsBody.data) {
      expect(r.bookingId).toBe(ids.bookingCompleteId);
      expect(typeof r.timeliness).toBe('number');
      expect(typeof r.professionalism).toBe('number');
      expect(typeof r.communication).toBe('number');
    }

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
    expect(disputes.status()).toBe(200);
    const disputesBody = await disputes.json();
    expect(Array.isArray(disputesBody.data)).toBe(true);
    expect(disputesBody.data.some((d: any) => d.id === ids.disputeId)).toBe(true);

    const resolve = await page.request.patch(`/api/disputes/${ids.disputeId}/resolve`, {
      headers: auth(ids.adminToken),
      data: { resolution: 'upheld', notes: 'Walkthrough resolution' },
    });
    expect(resolve.status()).toBe(200);
    const resolveBody = await resolve.json();
    expect(resolveBody.dispute).toBeDefined();
    expect(resolveBody.dispute.status).toMatch(/^(resolved|dismissed)$/);

    const creditSelf = await page.request.get(`/api/credit/${ids.clientId}`, {
      headers: auth(ids.clientToken),
    });
    expect(creditSelf.status()).toBe(200);
    const creditSelfBody = await creditSelf.json();
    expect(typeof creditSelfBody.creditScore).toBe('number');
    expect(creditSelfBody.creditScore).toBeGreaterThanOrEqual(0);
    expect(creditSelfBody.creditScore).toBeLessThanOrEqual(100);

    const creditAdmin = await page.request.get(`/api/credit/${ids.clientId}`, {
      headers: auth(ids.adminToken),
    });
    expect(creditAdmin.status()).toBe(200);
    const creditAdminBody = await creditAdmin.json();
    expect(typeof creditAdminBody.creditScore).toBe('number');
    // Admin and self view must agree on the score (no leakage of divergent internal data)
    expect(creditAdminBody.creditScore).toBe(creditSelfBody.creditScore);

    const notifList = await page.request.get('/api/notifications?page=1&limit=20', {
      headers: auth(ids.clientToken),
    });
    expect(notifList.status()).toBe(200);
    const notifBody = await notifList.json();
    expect(Array.isArray(notifBody.data)).toBe(true);
    if (notifBody.data.length > 0) {
      const notifId = notifBody.data[0].id;
      const markRead = await page.request.patch(`/api/notifications/${notifId}/read`, {
        headers: auth(ids.clientToken),
      });
      expect(markRead.status()).toBe(200);
      const markReadBody = await markRead.json();
      expect(markReadBody.notification ?? markReadBody).toBeDefined();
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
    expect(dashboard.status()).toBe(200);
    const dashboardBody = await dashboard.json();
    // dashboard returns numeric metrics
    expect(dashboardBody).toBeDefined();
    const dashStr = JSON.stringify(dashboardBody);
    expect(dashStr.length).toBeGreaterThan(2);

    const exportCsv = await page.request.get('/api/reports/export?format=csv', {
      headers: auth(ids.adminToken),
    });
    expect(exportCsv.status()).toBe(200);
    expect(exportCsv.headers()['content-type']).toMatch(/csv/);

    const exportXlsx = await page.request.get('/api/reports/export?format=xlsx', {
      headers: auth(ids.adminToken),
    });
    expect(exportXlsx.status()).toBe(200);
    expect(exportXlsx.headers()['content-type']).toMatch(/sheet|excel|octet/);

    const subCreate = await page.request.post('/api/report-subscriptions', {
      headers: auth(ids.adminToken),
      data: { reportType: 'walkthrough', filters: { role: 'lawyer' } },
    });
    expect(subCreate.status()).toBe(201);
    const subCreateBody = await subCreate.json();
    // Response returns raw DB row (snake_case).
    expect(subCreateBody.subscription.report_type ?? subCreateBody.subscription.reportType).toBe('walkthrough');
    ids.subId = subCreateBody.subscription.id;

    const subList = await page.request.get('/api/report-subscriptions', { headers: auth(ids.adminToken) });
    expect(subList.status()).toBe(200);
    const subListBody = await subList.json();
    expect(Array.isArray(subListBody.data)).toBe(true);
    expect(subListBody.data.some((s: any) => s.id === ids.subId)).toBe(true);

    const subPatch = await page.request.patch(`/api/report-subscriptions/${ids.subId}`, {
      headers: auth(ids.adminToken),
      data: { isActive: true },
    });
    expect(subPatch.status()).toBe(200);
    const subPatchBody = await subPatch.json();
    expect(subPatchBody.subscription.isActive ?? subPatchBody.subscription.is_active).toBe(true);

    const subDelete = await page.request.delete(`/api/report-subscriptions/${ids.subId}`, {
      headers: auth(ids.adminToken),
    });
    expect(subDelete.status()).toBe(204);

    const jobs = await page.request.get('/api/jobs?page=1&limit=20', {
      headers: auth(ids.adminToken),
    });
    expect(jobs.status()).toBe(200);
    const jobsBody = await jobs.json();
    expect(Array.isArray(jobsBody.data)).toBe(true);
    expect(typeof jobsBody.total).toBe('number');
    if (jobsBody.data.length > 0) {
      const jobById = await page.request.get(`/api/jobs/${jobsBody.data[0].id}`, {
        headers: auth(ids.adminToken),
      });
      expect(jobById.status()).toBe(200);
      const jobBody = await jobById.json();
      expect(jobBody.job.id).toBe(jobsBody.data[0].id);
    }

    const sysStatus = await page.request.get('/api/admin/system-status', { headers: auth(ids.adminToken) });
    expect(sysStatus.status()).toBe(200);
    const sysStatusBody = await sysStatus.json();
    expect(sysStatusBody).toHaveProperty('keyBackupConfirmed');
    expect(typeof sysStatusBody.keyBackupConfirmed).toBe('boolean');

    const confirmBackup = await page.request.post('/api/admin/confirm-key-backup', { headers: auth(ids.superToken) });
    expect(confirmBackup.status()).toBe(200);
    const confirmBody = await confirmBackup.json();
    expect(confirmBody.success).toBe(true);

    const audit = await page.request.get('/api/admin/audit-log?page=1&limit=20', {
      headers: auth(ids.superToken),
    });
    expect(audit.status()).toBe(200);
    const auditBody = await audit.json();
    expect(Array.isArray(auditBody.data)).toBe(true);
    expect(typeof auditBody.total).toBe('number');

    // Admin is NOT allowed on the audit log (super_admin-only) — assert the boundary.
    const auditByAdmin = await page.request.get('/api/admin/audit-log', { headers: auth(ids.adminToken) });
    expect(auditByAdmin.status()).toBe(403);

    const webhookCreate = await page.request.post('/api/webhooks', {
      headers: auth(ids.adminToken),
      data: {
        url: 'https://example.com/webhook',
        events: ['booking.created', 'booking.completed'],
        secret: `walkthroughSecret_${suffix}`,
      },
    });
    expect(webhookCreate.status()).toBe(201);
    const webhookCreateBody = await webhookCreate.json();
    expect(webhookCreateBody.webhook.url).toBe('https://example.com/webhook');
    // Secret must be masked in the response; the raw secret must never leak.
    expect(webhookCreateBody.webhook.secret).toBe('••••••••');
    expect(JSON.stringify(webhookCreateBody)).not.toContain(`walkthroughSecret_${suffix}`);
    ids.webhookId = webhookCreateBody.webhook.id;

    const webhookList = await page.request.get('/api/webhooks', { headers: auth(ids.adminToken) });
    expect(webhookList.status()).toBe(200);
    const webhookListBody = await webhookList.json();
    expect(webhookListBody.data.some((w: any) => w.id === ids.webhookId)).toBe(true);
    for (const w of webhookListBody.data) {
      expect(w.secret).toBe('••••••••');
    }

    const webhookPatch = await page.request.patch(`/api/webhooks/${ids.webhookId}`, {
      headers: auth(ids.adminToken),
      data: { url: 'https://example.com/webhook-updated', isActive: true },
    });
    expect(webhookPatch.status()).toBe(200);
    const webhookPatchBody = await webhookPatch.json();
    expect(webhookPatchBody.webhook.url).toBe('https://example.com/webhook-updated');
    expect(webhookPatchBody.webhook.secret).toBe('••••••••');

    const rotate = await page.request.post(`/api/webhooks/${ids.webhookId}/rotate-secret`, {
      headers: auth(ids.adminToken),
      data: { secret: `walkthroughSecret_rotated_${suffix}` },
    });
    expect(rotate.status()).toBe(200);
    const rotateBody = await rotate.json();
    expect(rotateBody.webhook.secret).toBe('••••••••');
    expect(JSON.stringify(rotateBody)).not.toContain(`walkthroughSecret_rotated_${suffix}`);

    const dictCreate = await page.request.post('/api/config/dictionaries', {
      headers: auth(ids.adminToken),
      data: {
        category: 'matter_type',
        key: `walk_${suffix}`,
        value: { label: 'Walkthrough', active: true },
      },
    });
    expect(dictCreate.status()).toBe(201);
    const dictCreateBody = await dictCreate.json();
    expect(dictCreateBody.entry.category).toBe('matter_type');
    expect(dictCreateBody.entry.key).toBe(`walk_${suffix}`);
    // admin-created entries must be scoped to caller's org (not global)
    expect(dictCreateBody.entry.org_id).toBe(ids.superOrgId);
    ids.dictId = dictCreateBody.entry.id;

    const dictList = await page.request.get('/api/config/dictionaries', { headers: auth(ids.adminToken) });
    expect(dictList.status()).toBe(200);
    const dictListBody = await dictList.json();
    expect(dictListBody.data.some((d: any) => d.id === ids.dictId)).toBe(true);

    const dictPatch = await page.request.patch(`/api/config/dictionaries/${ids.dictId}`, {
      headers: auth(ids.adminToken),
      data: { value: { label: 'Walkthrough Updated', active: true } },
    });
    expect(dictPatch.status()).toBe(200);
    const dictPatchBody = await dictPatch.json();
    const patchedValue = typeof dictPatchBody.entry.value === 'string'
      ? JSON.parse(dictPatchBody.entry.value) : dictPatchBody.entry.value;
    expect(patchedValue.label).toBe('Walkthrough Updated');

    const dictDelete = await page.request.delete(`/api/config/dictionaries/${ids.dictId}`, {
      headers: auth(ids.adminToken),
    });
    expect(dictDelete.status()).toBe(204);

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
    const stepCreateBody = await stepCreate.json();
    expect(stepCreateBody.step.name).toBe('Walkthrough Step');
    expect(stepCreateBody.step.workflow_type).toBe('intake');
    expect(stepCreateBody.step.step_order).toBe(99);
    ids.stepId = stepCreateBody.step.id;

    const stepList = await page.request.get('/api/config/workflow-steps', { headers: auth(ids.adminToken) });
    expect(stepList.status()).toBe(200);
    const stepListBody = await stepList.json();
    expect(stepListBody.data.some((s: any) => s.id === ids.stepId)).toBe(true);

    const stepPatch = await page.request.patch(`/api/config/workflow-steps/${ids.stepId}`, {
      headers: auth(ids.adminToken),
      data: { name: 'Walkthrough Step Updated', stepOrder: 100 },
    });
    expect(stepPatch.status()).toBe(200);
    const stepPatchBody = await stepPatch.json();
    expect(stepPatchBody.step.name).toBe('Walkthrough Step Updated');
    expect(stepPatchBody.step.step_order).toBe(100);

    const stepDelete = await page.request.delete(`/api/config/workflow-steps/${ids.stepId}`, {
      headers: auth(ids.adminToken),
    });
    expect(stepDelete.status()).toBe(204);
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
