import knex, { Knex } from 'knex';
import { logger } from '../logging/index.js';

let instance: Knex | null = null;

export function getKnex(): Knex {
  if (!instance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return instance;
}

export async function initDatabase(connectionString: string): Promise<Knex> {
  instance = knex({
    client: 'pg',
    connection: connectionString,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './src/infrastructure/database/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/infrastructure/database/seeds',
      extension: 'ts',
    },
  });

  let retries = 3;
  while (retries > 0) {
    try {
      await instance.raw('SELECT 1');
      logger.info('Database connection established');
      return instance;
    } catch (error) {
      retries--;
      if (retries === 0) {
        logger.error({ error }, 'Failed to connect to database after 3 attempts');
        throw error;
      }
      logger.warn({ retriesLeft: retries }, 'Database connection failed, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
    logger.info('Database connection closed');
  }
}
