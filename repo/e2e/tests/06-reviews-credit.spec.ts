import { test, expect } from '@playwright/test';
import { login, waitForShell, getAuthToken } from './helpers';

test.describe('Reviews & Credit Score', () => {
  test('reviews page loads for authenticated user', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);

    await page.locator('.sidebar a[href="/reviews"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Review');
  });

  test('full booking→review→credit flow via API', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    // Get IDs
    const clientMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${clientToken}` },
    })).json();
    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    // 1. Create booking
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(15, 0, 0, 0);
    const bookingRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: tomorrow.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(bookingRes.status()).toBe(201);
    const { booking } = await bookingRes.json();

    // 2. Lawyer confirms
    const confirmRes = await page.request.patch(`/api/bookings/${booking.id}/confirm`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(confirmRes.ok()).toBe(true);

    // 3. Lawyer completes
    const completeRes = await page.request.patch(`/api/bookings/${booking.id}/complete`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(completeRes.ok()).toBe(true);

    // 4. Client submits review
    const reviewRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        bookingId: booking.id,
        timeliness: 5,
        professionalism: 4,
        communication: 5,
        comment: 'Excellent consultation, very helpful!',
      },
    });
    expect(reviewRes.status()).toBe(201);
    const { review } = await reviewRes.json();
    expect(review.timeliness).toBe(5);
    expect(review.reviewerId).toBe(clientMe.user.id);
    expect(review.revieweeId).toBe(lawyerMe.user.id);

    // 5. Duplicate review should be rejected
    const dupRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        bookingId: booking.id,
        timeliness: 3,
        professionalism: 3,
        communication: 3,
      },
    });
    expect(dupRes.status()).toBe(409);

    // 6. Lawyer also submits review for client
    const lawyerReviewRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
      data: {
        bookingId: booking.id,
        timeliness: 4,
        professionalism: 4,
        communication: 4,
        comment: 'Good client, punctual',
      },
    });
    expect(lawyerReviewRes.status()).toBe(201);

    // 7. Check credit history
    const creditRes = await page.request.get(`/api/credit/${clientMe.user.id}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(creditRes.ok()).toBe(true);
    const creditBody = await creditRes.json();
    expect(typeof creditBody.creditScore).toBe('number');
  });

  test('cannot review a non-completed booking', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    // Create booking (pending status) - use unique time far in the future
    const day = new Date(Date.now() + 30 * 86400000);
    day.setHours(8, Math.floor(Math.random() * 60), 0, 0);
    const bookingRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: day.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(bookingRes.status()).toBe(201);
    const bookingBody = await bookingRes.json();
    const booking = bookingBody.booking;

    // Try to review the pending booking
    const reviewRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        bookingId: booking.id,
        timeliness: 5,
        professionalism: 5,
        communication: 5,
      },
    });
    expect(reviewRes.status()).toBe(409); // Can only review completed bookings
  });
});
