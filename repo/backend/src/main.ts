import { buildServer } from './api/server.js';
import { initDatabase, closeDatabase } from './infrastructure/database/connection.js';
import { loadConfig } from './config/index.js';
import { logger } from './infrastructure/logging/index.js';
import { JobWorker } from './workers/job-worker.js';
import { Scheduler } from './workers/scheduler.js';

async function main() {
  const config = loadConfig();

  // Propagate resolved config (including dev defaults) into process.env
  // so modules that read env vars directly (encryption, jwt) get correct values.
  process.env.DATABASE_URL = config.database.url;
  process.env.JWT_SECRET = config.jwt.secret;
  process.env.ENCRYPTION_KEY = config.encryption.key;
  process.env.NODE_ENV = config.nodeEnv;

  logger.info({ nodeEnv: config.nodeEnv }, 'Starting JusticeOps backend');

  // Initialize database
  const db = await initDatabase(config.database.url);

  // Run migrations
  logger.info('Running database migrations...');
  await db.migrate.latest();
  logger.info('Migrations complete');

  // Run seeds in non-production or if DB is empty
  // Bypass RLS for counting/seeding
  await db.raw("SET app.bypass_rls = 'true'");
  const userCount = await db('users').count('id as count').first();
  if (!userCount || Number(userCount.count) === 0) {
    logger.info('Running database seeds...');
    await db.seed.run();
    logger.info('Seeds complete');
  }

  // Build and start server
  const app = await buildServer();

  // Store config and db on app for plugins to use
  app.decorate('config', config);
  app.decorate('db', db);

  // Start job worker and scheduler
  const jobWorker = new JobWorker(db);
  const scheduler = new Scheduler(db);
  jobWorker.start();
  scheduler.start();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'JusticeOps backend running');
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    jobWorker.stop();
    scheduler.stop();
    await closeDatabase();
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    jobWorker.stop();
    scheduler.stop();
    await app.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
