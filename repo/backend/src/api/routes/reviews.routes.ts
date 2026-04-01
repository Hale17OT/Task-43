import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../plugins/authorize.plugin.js';
import { createReviewSchema, createDisputeSchema, resolveDisputeSchema } from '../schemas/review.js';
import { KnexReviewRepository } from '../../infrastructure/database/repositories/review-repository.js';
import { KnexBookingRepository } from '../../infrastructure/database/repositories/booking-repository.js';
import { KnexCreditRepository } from '../../infrastructure/database/repositories/credit-repository.js';
import { KnexUserRepository } from '../../infrastructure/database/repositories/user-repository.js';
import { isWithinDisputeWindow } from '../../domain/entities/review.js';
import { CreditScore } from '../../domain/value-objects/credit-score.js';
import { WebhookDispatcher } from '../../infrastructure/webhooks/dispatcher.js';

export default async function reviewRoutes(app: FastifyInstance) {
  // GET /api/reviews
  app.get('/api/reviews', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const db = request.db;

    const repo = new KnexReviewRepository(db);
    const bookingRepo = new KnexBookingRepository(db);
    const query = request.query as Record<string, string>;
    const { userId, role } = request.user;
    const isAdmin = role === 'admin' || role === 'super_admin';

    if (query.bookingId) {
      // Verify requester is a participant of the booking (or admin)
      if (!isAdmin) {
        const booking = await bookingRepo.findById(query.bookingId);
        if (!booking || (booking.clientId !== userId && booking.lawyerId !== userId)) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'You are not a participant of this booking' });
        }
      }
      const reviews = await repo.findReviewsByBookingId(query.bookingId);
      return { data: reviews, total: reviews.length };
    }

    // Support reviewerId / revieweeId for given/received filtering
    if (query.reviewerId) {
      if (query.reviewerId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own reviews' });
      }
      return repo.findReviewsByRole(query.reviewerId, 'reviewer', {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
      });
    }

    if (query.revieweeId) {
      if (query.revieweeId !== userId && !isAdmin) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own reviews' });
      }
      return repo.findReviewsByRole(query.revieweeId, 'reviewee', {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
      });
    }

    // Non-admins can only query their own reviews
    if (query.userId && query.userId !== userId && !isAdmin) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own reviews' });
    }

    return repo.findReviewsByUserId(query.userId || userId, {
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });
  });

  // POST /api/reviews
  app.post('/api/reviews', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createReviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const reviewRepo = new KnexReviewRepository(db);
    const bookingRepo = new KnexBookingRepository(db);

    const booking = await bookingRepo.findById(parsed.data.bookingId);
    if (!booking) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
    }

    if (booking.status !== 'completed') {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Can only review completed bookings' });
    }

    // Verify reviewer is a participant
    const { userId } = request.user;
    if (userId !== booking.clientId && userId !== booking.lawyerId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You are not a participant of this booking' });
    }

    // Check duplicate
    const alreadyReviewed = await reviewRepo.hasUserReviewedBooking(parsed.data.bookingId, userId);
    if (alreadyReviewed) {
      return reply.status(409).send({ error: 'CONFLICT', message: 'You have already reviewed this booking' });
    }

    // Determine reviewee
    const revieweeId = userId === booking.clientId ? booking.lawyerId : booking.clientId;

    const review = await reviewRepo.createReview({
      bookingId: parsed.data.bookingId,
      reviewerId: userId,
      revieweeId,
      timeliness: parsed.data.timeliness,
      professionalism: parsed.data.professionalism,
      communication: parsed.data.communication,
      comment: parsed.data.comment,
    });

    new WebhookDispatcher(db).dispatch(request.user.orgId, 'review.created', { review }).catch(() => {});
    return reply.status(201).send({ review });
  });

  // GET /api/disputes
  app.get('/api/disputes', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const repo = new KnexReviewRepository(db);
    const query = request.query as Record<string, string>;
    const { role, orgId } = request.user;
    return repo.findDisputes({
      status: query.status,
      orgId: role === 'super_admin' ? undefined : orgId,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });
  });

  // POST /api/disputes
  app.post('/api/disputes', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createDisputeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const reviewRepo = new KnexReviewRepository(db);
    const creditRepo = new KnexCreditRepository(db);
    const userRepo = new KnexUserRepository(db);

    const review = await reviewRepo.findReviewById(parsed.data.reviewId);
    if (!review) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Review not found' });
    }

    // Verify appellant is the reviewee
    if (review.revieweeId !== request.user.userId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Only the reviewee can file a dispute' });
    }

    // Check 7-day window
    const serverNow = new Date();
    if (!isWithinDisputeWindow(review.createdAt, serverNow)) {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Appeal window has closed (7 days)' });
    }

    // Escrow penalties — use a temporary UUID placeholder until the dispute is created
    const tempDisputeId = crypto.randomUUID();
    const escrowed = await creditRepo.escrowEntries(request.user.userId, tempDisputeId);
    let totalEscrowed = 0;
    for (const entry of escrowed) {
      totalEscrowed += entry.changeAmount;
    }

    if (totalEscrowed < 0) {
      const user = await userRepo.findById(request.user.userId);
      if (user) {
        const restored = CreditScore.create(user.creditScore - totalEscrowed); // subtract negative = add
        await userRepo.updateCreditScore(user.id, restored.value);
      }
    }

    const deadlineAt = new Date(review.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dispute = await reviewRepo.createDispute({
      reviewId: parsed.data.reviewId,
      appellantId: request.user.userId,
      orgId: request.user.orgId,
      reason: parsed.data.reason,
      deadlineAt,
      penaltyEscrowed: escrowed,
    });

    // Update escrow entries with actual dispute ID
    await db('credit_score_history')
      .where({ dispute_id: tempDisputeId })
      .update({ dispute_id: dispute.id });

    return reply.status(201).send({ dispute });
  });

  // PATCH /api/disputes/:id/resolve
  app.patch('/api/disputes/:id/resolve', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = resolveDisputeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const reviewRepo = new KnexReviewRepository(db);
    const creditRepo = new KnexCreditRepository(db);
    const userRepo = new KnexUserRepository(db);

    const dispute = await reviewRepo.findDisputeById(id);
    if (!dispute) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Dispute not found' });
    }

    if (dispute.status === 'resolved' || dispute.status === 'dismissed') {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Dispute already resolved' });
    }

    const isUpheld = parsed.data.resolution === 'upheld';
    const newStatus = isUpheld ? 'resolved' : 'dismissed';

    // If dismissed, re-apply escrowed penalties
    if (!isUpheld && dispute.penaltyEscrowed) {
      const user = await userRepo.findById(dispute.appellantId);
      if (user) {
        let totalPenalty = 0;
        for (const entry of dispute.penaltyEscrowed as any[]) {
          totalPenalty += entry.changeAmount;
        }
        const newScore = CreditScore.create(user.creditScore + totalPenalty);
        await userRepo.updateCreditScore(user.id, newScore.value);
      }
    }

    await creditRepo.resolveEscrow(id, !isUpheld);

    const updated = await reviewRepo.updateDispute(id, {
      status: newStatus,
      resolutionNotes: parsed.data.notes ?? null,
      adminId: request.user.userId,
      resolvedAt: new Date(),
    });

    return { dispute: updated };
  });
}
