import { test, expect } from '@playwright/test';
import { getAuthToken } from './helpers';

test.describe('Arbitration API: Dispute Filtering & Resolution', () => {
  let adminToken: string;
  let clientToken: string;
  let lawyerToken: string;
  let bookingId: string;
  let reviewId: string;
  let disputeId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    clientToken = await getAuthToken(page, 'client1');
    lawyerToken = await getAuthToken(page, 'lawyer1');
    adminToken = await getAuthToken(page, 'admin1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    // Create booking -> confirm -> complete -> review -> dispute
    const futureDate = new Date(Date.now() + 90 * 86400000);
    futureDate.setHours(10, Math.floor(Math.random() * 60), 0, 0);
    const bookingRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(bookingRes.status()).toBe(201);
    const bookingBody = await bookingRes.json();
    bookingId = bookingBody.booking.id;

    await page.request.patch(`/api/bookings/${bookingId}/confirm`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    await page.request.patch(`/api/bookings/${bookingId}/complete`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });

    // Client reviews lawyer
    const reviewRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        bookingId,
        timeliness: 1,
        professionalism: 1,
        communication: 1,
        comment: 'Dispute test review',
      },
    });
    expect(reviewRes.status()).toBe(201);
    const reviewBody = await reviewRes.json();
    reviewId = reviewBody.review.id;

    // Lawyer files dispute against the review
    const disputeRes = await page.request.post('/api/disputes', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
      data: {
        reviewId,
        reason: 'This review is inaccurate and unfair to my professional record',
      },
    });
    if (disputeRes.status() !== 201) {
      const errBody = await disputeRes.text();
      console.error('Dispute creation failed:', disputeRes.status(), errBody);
    }
    expect(disputeRes.status()).toBe(201);
    const disputeBody = await disputeRes.json();
    disputeId = disputeBody.dispute.id;

    await page.close();
  });

  test('admin can list disputes with comma-separated status filter', async ({ page }) => {
    const res = await page.request.get('/api/disputes?status=pending,under_review', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const dispute of body.data) {
      expect(['pending', 'under_review']).toContain(dispute.status);
    }
  });

  test('admin can list disputes with single status filter', async ({ page }) => {
    const res = await page.request.get('/api/disputes?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    for (const dispute of body.data) {
      expect(dispute.status).toBe('pending');
    }
  });

  test('admin can resolve dispute with correct payload (upheld)', async ({ page }) => {
    const res = await page.request.patch(`/api/disputes/${disputeId}/resolve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        resolution: 'upheld',
        notes: 'Review was found to be biased',
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.dispute.status).toBe('resolved');
  });

  test('resolve with wrong payload keys returns 422', async ({ page }) => {
    // Create another dispute for this test
    const futureDate = new Date(Date.now() + 91 * 86400000);
    futureDate.setHours(11, Math.floor(Math.random() * 60), 0, 0);

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    const bRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    const b = await bRes.json();
    await page.request.patch(`/api/bookings/${b.booking.id}/confirm`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    await page.request.patch(`/api/bookings/${b.booking.id}/complete`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    const rRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: { bookingId: b.booking.id, timeliness: 2, professionalism: 2, communication: 2 },
    });
    const r = await rRes.json();
    const dRes = await page.request.post('/api/disputes', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
      data: { reviewId: r.review.id, reason: 'Unfair review needs admin attention urgently' },
    });
    const d = await dRes.json();

    // Send with WRONG keys (status/resolutionNotes instead of resolution/notes)
    const wrongRes = await page.request.patch(`/api/disputes/${d.dispute.id}/resolve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: 'resolved',
        resolutionNotes: 'Some notes',
      },
    });
    expect(wrongRes.status()).toBe(422);
  });

  test('resolved disputes appear in resolved filter', async ({ page }) => {
    const res = await page.request.get('/api/disputes?status=resolved,dismissed', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const dispute of body.data) {
      expect(['resolved', 'dismissed']).toContain(dispute.status);
    }
  });
});

test.describe('Report Subscription Toggle API', () => {
  test('admin can toggle subscription active state', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');

    // Create subscription
    const createRes = await page.request.post('/api/report-subscriptions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { reportType: 'utilization' },
    });
    expect(createRes.status()).toBe(201);
    const { subscription } = await createRes.json();
    expect(subscription.is_active).toBe(true);

    // Toggle to inactive using camelCase (API contract)
    const toggleRes = await page.request.patch(`/api/report-subscriptions/${subscription.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { isActive: false },
    });
    expect(toggleRes.ok()).toBe(true);
    const toggled = await toggleRes.json();
    expect(toggled.subscription.is_active).toBe(false);

    // Toggle back using camelCase
    const toggleBackRes = await page.request.patch(`/api/report-subscriptions/${subscription.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { isActive: true },
    });
    expect(toggleBackRes.ok()).toBe(true);
    const toggledBack = await toggleBackRes.json();
    expect(toggledBack.subscription.is_active).toBe(true);

    // Cleanup
    await page.request.delete(`/api/report-subscriptions/${subscription.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
