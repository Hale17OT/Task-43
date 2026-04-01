import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { KnexCreditRepository } from '../../infrastructure/database/repositories/credit-repository.js';
import { KnexUserRepository } from '../../infrastructure/database/repositories/user-repository.js';

export default async function creditRoutes(app: FastifyInstance) {
  // GET /api/credit/:userId
  app.get('/api/credit/:userId', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { role, userId: currentUserId } = request.user;

    // Self or admin/super_admin can always view
    // Clients can only view own credit
    if (role === 'client' && userId !== currentUserId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own credit history' });
    }

    // Lawyers can view own credit or credit of clients they share bookings with
    if (role === 'lawyer' && userId !== currentUserId) {
      const db = request.db;
      const sharedBooking = await db('bookings')
        .where({ lawyer_id: currentUserId, client_id: userId })
        .first();
      if (!sharedBooking) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view credit for your own clients' });
      }
    }

    const db = request.db;

    const userRepo = new KnexUserRepository(db);
    const creditRepo = new KnexCreditRepository(db);

    const user = await userRepo.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    }

    const query = request.query as Record<string, string>;
    const history = await creditRepo.getHistory(userId, {
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });

    return { creditScore: user.creditScore, ...history };
  });
}
