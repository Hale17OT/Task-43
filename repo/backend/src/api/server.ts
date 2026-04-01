import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwtAuthPlugin from './plugins/jwt-auth.plugin.js';
import orgIsolationPlugin from './plugins/org-isolation.plugin.js';
import auditPlugin from './plugins/audit.plugin.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import organizationRoutes from './routes/organizations.routes.js';
import availabilityRoutes from './routes/availability.routes.js';
import bookingRoutes from './routes/bookings.routes.js';
import reviewRoutes from './routes/reviews.routes.js';
import creditRoutes from './routes/credit.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import jobRoutes from './routes/jobs.routes.js';
import reportRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';
import webhookRoutes from './routes/webhooks.routes.js';
import configRoutes from './routes/config.routes.js';
import { logger } from '../infrastructure/logging/index.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  // CORS — LAN only
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // JWT Auth plugin
  await app.register(jwtAuthPlugin);

  // Org isolation (RLS enforcement) — must be after jwt-auth
  await app.register(orgIsolationPlugin);

  // Audit plugin
  await app.register(auditPlugin);

  // Routes
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(organizationRoutes);
  await app.register(availabilityRoutes);
  await app.register(bookingRoutes);
  await app.register(reviewRoutes);
  await app.register(creditRoutes);
  await app.register(notificationRoutes);
  await app.register(jobRoutes);
  await app.register(reportRoutes);
  await app.register(adminRoutes);
  await app.register(webhookRoutes);
  await app.register(configRoutes);

  // Global error handler
  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      logger.error({
        err: error.message,
        stack: error.stack,
        method: request.method,
        url: request.url,
        userId: (request as any).userId,
      }, 'Internal server error');
    }

    const response: Record<string, unknown> = {
      error: getErrorCode(statusCode),
      message: statusCode >= 500 ? 'An unexpected error occurred' : error.message,
    };

    if (error.details) {
      response.details = error.details;
    }

    if (error.retryAfterSeconds) {
      response.retryAfterSeconds = error.retryAfterSeconds;
    }

    reply.status(statusCode).send(response);
  });

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Time sync endpoint (public)
  app.get('/api/time', async () => {
    return { serverTime: new Date().toISOString() };
  });

  return app;
}

function getErrorCode(statusCode: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    423: 'LOCKED',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return codes[statusCode] ?? 'UNKNOWN_ERROR';
}
