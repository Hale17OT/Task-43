import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../plugins/authorize.plugin.js';
import { rateLimitBooking } from '../plugins/rate-limit.plugin.js';
import { createBookingSchema, rescheduleBookingSchema, cancelBookingSchema } from '../schemas/booking.js';
import { KnexBookingRepository } from '../../infrastructure/database/repositories/booking-repository.js';
import { KnexUserRepository } from '../../infrastructure/database/repositories/user-repository.js';
import { KnexNotificationRepository } from '../../infrastructure/database/repositories/notification-repository.js';
import { KnexCreditRepository } from '../../infrastructure/database/repositories/credit-repository.js';
import { isValidTransition, isWithinCancellationPenaltyWindow, isPastNoShowGrace } from '../../domain/entities/booking.js';
import { CreditScore } from '../../domain/value-objects/credit-score.js';
import { encrypt } from '../../infrastructure/encryption/index.js';
import { CREDIT_THRESHOLD } from '../../config/credit-rules.js';
import { WebhookDispatcher } from '../../infrastructure/webhooks/dispatcher.js';
import { safePagination } from '../schemas/pagination.js';
import { logger } from '../../infrastructure/logging/index.js';

export default async function bookingRoutes(app: FastifyInstance) {
  // GET /api/bookings
  app.get('/api/bookings', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const repo = new KnexBookingRepository(db);
    const query = request.query as Record<string, string>;
    const { role, userId, orgId } = request.user;

    const filters: Record<string, any> = {
      ...safePagination(query),
    };

    if (query.status) filters.status = query.status;
    if (query.type) filters.type = query.type;
    if (query.from) filters.from = new Date(query.from);
    if (query.to) filters.to = new Date(query.to);

    // Scope by role
    if (role === 'client') filters.clientId = userId;
    else if (role === 'lawyer') filters.lawyerId = userId;
    else if (role === 'super_admin') {
      // Super-admin: optional orgId filter; omit for cross-tenant view
      if (query.orgId) filters.orgId = query.orgId;
    } else {
      // Org-scoped admin: always restricted to own org
      filters.orgId = orgId;
    }

    return repo.findAll(filters);
  });

  // GET /api/bookings/:id
  app.get('/api/bookings/:id', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const repo = new KnexBookingRepository(db);

    const booking = await repo.findById(id);
    if (!booking) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }

    // Resource ownership
    const { role, userId } = request.user;
    if (role === 'client' && booking.clientId !== userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (role === 'lawyer' && booking.lawyerId !== userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }

    return { booking };
  });

  // POST /api/bookings
  app.post('/api/bookings', {
    preHandler: [app.authenticate, authorize('client'), rateLimitBooking],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;


    // Check idempotency (scoped by key + user + method + path, only if not expired)
    const existing = await db('idempotency_registry').where({
      key: parsed.data.idempotencyKey,
      user_id: request.user.userId,
      method: 'POST',
      path: '/api/bookings',
    }).where('expires_at', '>', new Date()).first();
    if (existing) {
      return reply.status(existing.status_code).send(existing.response_body);
    }

    // Credit threshold check
    const userRepo = new KnexUserRepository(db);
    const user = await userRepo.findById(request.user.userId);
    if (!user || user.creditScore < CREDIT_THRESHOLD) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Account Under Review: Your credit score is below the minimum threshold for new bookings.',
      });
    }

    // Validate lawyerId: must be an active lawyer in the same org
    const lawyer = await userRepo.findById(parsed.data.lawyerId);
    if (!lawyer || lawyer.role !== 'lawyer' || !lawyer.isActive || lawyer.orgId !== request.user.orgId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Lawyer not found or not available' });
    }

    const bookingRepo = new KnexBookingRepository(db);

    try {
      const booking = await db.transaction(async (trx) => {
        const txBookingRepo = new KnexBookingRepository(trx);

        if (parsed.data.type === 'consultation') {
          const scheduledAt = new Date(parsed.data.scheduledAt!);
          // Advisory lock
          await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`${parsed.data.lawyerId}:${scheduledAt.toISOString()}`]);

          // Check conflict
          const conflict = await txBookingRepo.checkConflict(parsed.data.lawyerId, scheduledAt);
          if (conflict) {
            throw Object.assign(new Error('Time slot unavailable'), { statusCode: 409 });
          }

          return txBookingRepo.create({
            clientId: request.user.userId,
            lawyerId: parsed.data.lawyerId,
            orgId: request.user.orgId,
            type: 'consultation',
            scheduledAt,
            idempotencyKey: parsed.data.idempotencyKey,
          });
        } else {
          // Milestone
          const deadlineAt = new Date(parsed.data.deadlineAt!);
          const weight = parsed.data.weight ?? 1;

          // Advisory lock keyed by lawyer + date to prevent concurrent capacity oversell
          const dateKey = deadlineAt.toISOString().split('T')[0];
          await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`milestone:${parsed.data.lawyerId}:${dateKey}`]);

          const currentWeight = await txBookingRepo.getDailyMilestoneWeight(parsed.data.lawyerId, deadlineAt);
          const lawyer = await new KnexUserRepository(trx).findById(parsed.data.lawyerId);
          const capacity = lawyer?.dailyCapacity ?? 10;

          if (currentWeight + weight > capacity) {
            throw Object.assign(new Error("Lawyer's daily capacity is full for this date"), { statusCode: 409 });
          }

          return txBookingRepo.create({
            clientId: request.user.userId,
            lawyerId: parsed.data.lawyerId,
            orgId: request.user.orgId,
            type: 'milestone',
            deadlineAt,
            weight,
            idempotencyKey: parsed.data.idempotencyKey,
          });
        }
      });

      // Store idempotency response
      const responseBody = { booking };
      await db('idempotency_registry').insert({
        key: parsed.data.idempotencyKey,
        user_id: request.user.userId,
        method: 'POST',
        path: '/api/bookings',
        status_code: 201,
        response_body: JSON.stringify(responseBody),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // Dispatch webhook
      const dispatcher = new WebhookDispatcher(db);
      dispatcher.dispatch(request.user.orgId, 'booking.created', { booking }).catch((err: any) => logger.warn({ err: err?.message }, 'Webhook dispatch failed'));

      return reply.status(201).send(responseBody);
    } catch (err: any) {
      if (err.statusCode === 409) {
        return reply.status(409).send({ error: 'CONFLICT', message: err.message });
      }
      throw err;
    }
  });

  // PATCH /api/bookings/:id/confirm
  app.patch('/api/bookings/:id/confirm', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const repo = new KnexBookingRepository(db);

    const booking = await repo.findById(id);
    if (!booking || booking.lawyerId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (!isValidTransition(booking.status, 'confirmed')) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot confirm a ${booking.status} booking` });
    }

    const updated = await repo.updateStatus(id, 'confirmed');
    new WebhookDispatcher(db).dispatch(request.user.orgId, 'booking.confirmed', { booking: updated }).catch((err: any) => logger.warn({ err: err?.message }, 'Webhook dispatch failed'));
    return { booking: updated };
  });

  // PATCH /api/bookings/:id/decline
  app.patch('/api/bookings/:id/decline', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const repo = new KnexBookingRepository(db);

    const booking = await repo.findById(id);
    if (!booking || booking.lawyerId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (!isValidTransition(booking.status, 'declined')) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot decline a ${booking.status} booking` });
    }

    const updated = await repo.updateStatus(id, 'declined');
    new WebhookDispatcher(db).dispatch(request.user.orgId, 'booking.declined', { booking: updated }).catch((err: any) => logger.warn({ err: err?.message }, 'Webhook dispatch failed'));
    return { booking: updated };
  });

  // PATCH /api/bookings/:id/cancel
  app.patch('/api/bookings/:id/cancel', {
    preHandler: [app.authenticate, authorize('client')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = cancelBookingSchema.safeParse(request.body ?? {});

    const db = request.db;

    const bookingRepo = new KnexBookingRepository(db);
    const userRepo = new KnexUserRepository(db);
    const creditRepo = new KnexCreditRepository(db);

    const booking = await bookingRepo.findById(id);
    if (!booking || booking.clientId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (!isValidTransition(booking.status, 'cancelled')) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot cancel a ${booking.status} booking` });
    }

    let creditPenaltyApplied = false;
    const serverNow = new Date();

    // Check cancellation penalty (only for confirmed bookings with scheduled time)
    if (booking.status === 'confirmed' && booking.scheduledAt && isWithinCancellationPenaltyWindow(booking.scheduledAt, serverNow)) {
      const user = await userRepo.findById(request.user.userId);
      if (user) {
        const currentScore = CreditScore.create(user.creditScore);
        const newScore = currentScore.apply(-5);
        await userRepo.updateCreditScore(user.id, newScore.value);
        await creditRepo.addEntry({
          userId: user.id,
          previousScore: currentScore.value,
          changeAmount: -5,
          newScore: newScore.value,
          ruleCode: 'CANCELLATION_PENALTY',
          reason: 'Late cancellation within 2 hours of scheduled time',
          isEscrowed: false,
          disputeId: null,
        });
        creditPenaltyApplied = true;
      }
    }

    const extra: any = {};
    if (body.success && body.data.reason) {
      extra.cancellationReasonEnc = Buffer.from(encrypt(body.data.reason));
    }

    const updated = await bookingRepo.updateStatus(id, 'cancelled', extra);
    new WebhookDispatcher(db).dispatch(request.user.orgId, 'booking.cancelled', { booking: updated }).catch((err: any) => logger.warn({ err: err?.message }, 'Webhook dispatch failed'));
    return { booking: updated, creditPenaltyApplied };
  });

  // PATCH /api/bookings/:id/complete
  app.patch('/api/bookings/:id/complete', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const bookingRepo = new KnexBookingRepository(db);
    const notifRepo = new KnexNotificationRepository(db);

    const booking = await bookingRepo.findById(id);
    if (!booking || booking.lawyerId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (!isValidTransition(booking.status, 'completed')) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot complete a ${booking.status} booking` });
    }

    const completedAt = new Date();
    const updated = await bookingRepo.updateStatus(id, 'completed', { completedAt });

    // Check late delivery for milestone bookings — apply penalty to lawyer
    const creditRepo = new KnexCreditRepository(db);
    const userRepo = new KnexUserRepository(db);
    let lateDeliveryApplied = false;

    if (booking.type === 'milestone' && booking.deadlineAt && completedAt > new Date(booking.deadlineAt)) {
      const lawyerUser = await userRepo.findById(booking.lawyerId);
      if (lawyerUser) {
        const currentScore = CreditScore.create(lawyerUser.creditScore);
        const newScore = currentScore.apply(-5);
        await userRepo.updateCreditScore(lawyerUser.id, newScore.value);
        await creditRepo.addEntry({
          userId: lawyerUser.id,
          previousScore: currentScore.value,
          changeAmount: -5,
          newScore: newScore.value,
          ruleCode: 'LATE_DELIVERY',
          reason: `Milestone completed after deadline (${booking.deadlineAt})`,
          isEscrowed: false,
          disputeId: null,
        });
        lateDeliveryApplied = true;
      }
    }

    // Notify both parties to review
    await notifRepo.create({
      userId: booking.clientId,
      title: 'Booking Completed — Please Submit a Review',
      body: `Your booking has been completed. Please submit a review for the service.`,
      type: 'review_prompt',
      referenceId: booking.id,
    });
    await notifRepo.create({
      userId: booking.lawyerId,
      title: 'Booking Completed — Please Submit a Review',
      body: `A booking has been completed. Please submit a review for the client.`,
      type: 'review_prompt',
      referenceId: booking.id,
    });

    // Check streak bonus for client
    const streakCount = await creditRepo.getConsecutiveOnTimeCount(booking.clientId);
    if (streakCount >= 5) {
      const client = await userRepo.findById(booking.clientId);
      if (client) {
        const currentScore = CreditScore.create(client.creditScore);
        const newScore = currentScore.apply(2);
        await userRepo.updateCreditScore(client.id, newScore.value);
        await creditRepo.addEntry({
          userId: client.id,
          previousScore: currentScore.value,
          changeAmount: 2,
          newScore: newScore.value,
          ruleCode: 'STREAK_BONUS',
          reason: 'Five consecutive on-time completions',
          isEscrowed: false,
          disputeId: null,
        });
      }
    }

    new WebhookDispatcher(db).dispatch(request.user.orgId, 'booking.completed', { booking: updated }).catch((err: any) => logger.warn({ err: err?.message }, 'Webhook dispatch failed'));
    return { booking: updated, lateDeliveryApplied };
  });

  // PATCH /api/bookings/:id/no-show
  app.patch('/api/bookings/:id/no-show', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const bookingRepo = new KnexBookingRepository(db);
    const userRepo = new KnexUserRepository(db);
    const creditRepo = new KnexCreditRepository(db);

    const booking = await bookingRepo.findById(id);
    if (!booking || booking.lawyerId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (!isValidTransition(booking.status, 'no_show')) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot mark no-show on a ${booking.status} booking` });
    }

    // Check 10-minute grace period
    const serverNow = new Date();
    if (booking.scheduledAt && !isPastNoShowGrace(booking.scheduledAt, serverNow)) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'Cannot mark no-show before 10 minutes past the scheduled start time',
      });
    }

    const updated = await bookingRepo.updateStatus(id, 'no_show');

    // Apply credit penalty
    const client = await userRepo.findById(booking.clientId);
    if (client) {
      const currentScore = CreditScore.create(client.creditScore);
      const newScore = currentScore.apply(-10);
      await userRepo.updateCreditScore(client.id, newScore.value);
      await creditRepo.addEntry({
        userId: client.id,
        previousScore: currentScore.value,
        changeAmount: -10,
        newScore: newScore.value,
        ruleCode: 'NO_SHOW',
        reason: 'No-show after 10 minutes past scheduled start',
        isEscrowed: false,
        disputeId: null,
      });
    }

    new WebhookDispatcher(db).dispatch(request.user.orgId, 'booking.no_show', { booking: updated }).catch((err: any) => logger.warn({ err: err?.message }, 'Webhook dispatch failed'));
    return { booking: updated, creditPenalty: -10 };
  });

  // PATCH /api/bookings/:id/reschedule
  app.patch('/api/bookings/:id/reschedule', {
    preHandler: [app.authenticate, authorize('client'), rateLimitBooking],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = rescheduleBookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    // Check idempotency (scoped by key + user + method + path, only if not expired)
    const existingIdem = await db('idempotency_registry').where({
      key: parsed.data.idempotencyKey,
      user_id: request.user.userId,
      method: 'PATCH',
      path: `/api/bookings/${id}/reschedule`,
    }).where('expires_at', '>', new Date()).first();
    if (existingIdem) {
      return reply.status(existingIdem.status_code).send(existingIdem.response_body);
    }

    const bookingRepo = new KnexBookingRepository(db);

    const booking = await bookingRepo.findById(id);
    if (!booking || booking.clientId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (!isValidTransition(booking.status, 'rescheduled')) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot reschedule a ${booking.status} booking` });
    }

    // Validate lawyer is still active and in same org
    const userRepo = new KnexUserRepository(db);
    const lawyer = await userRepo.findById(booking.lawyerId);
    if (!lawyer || lawyer.role !== 'lawyer' || !lawyer.isActive || lawyer.orgId !== request.user.orgId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Lawyer not found or not available' });
    }

    // Create new booking and mark old as rescheduled atomically
    const newScheduledAt = new Date(parsed.data.newScheduledAt);
    const newBooking = await db.transaction(async (trx) => {
      const txRepo = new KnexBookingRepository(trx);
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`${booking.lawyerId}:${newScheduledAt.toISOString()}`]);

      const conflict = await txRepo.checkConflict(booking.lawyerId, newScheduledAt);
      if (conflict) {
        throw Object.assign(new Error('New time slot unavailable'), { statusCode: 409 });
      }

      // Mark old booking as rescheduled inside the transaction
      await txRepo.updateStatus(id, 'rescheduled');

      return txRepo.create({
        clientId: booking.clientId,
        lawyerId: booking.lawyerId,
        orgId: booking.orgId,
        type: booking.type,
        scheduledAt: newScheduledAt,
        idempotencyKey: parsed.data.idempotencyKey,
      });
    });

    // Store idempotency response
    const responseBody = { newBooking };
    await db('idempotency_registry').insert({
      key: parsed.data.idempotencyKey,
      user_id: request.user.userId,
      method: 'PATCH',
      path: `/api/bookings/${id}/reschedule`,
      status_code: 201,
      response_body: JSON.stringify(responseBody),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return reply.status(201).send(responseBody);
  });
}
