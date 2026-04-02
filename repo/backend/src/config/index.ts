export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  encryption: {
    key: string;
  };
  rateLimit: {
    bookingPerUser: number;
    bookingPerOrg: number;
  };
  credit: {
    threshold: number;
  };
  cors: {
    origins: string[];
  };
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEV_JWT_SECRET = 'dev-jwt-secret-change-in-production-min32chars';
const DEV_ENCRYPTION_KEY = 'dev-encryption-key-change-in-prd';

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isDev = nodeEnv === 'development' || nodeEnv === 'test';

  const jwtSecret = requireEnv('JWT_SECRET', isDev ? DEV_JWT_SECRET : undefined);
  const encryptionKey = requireEnv('ENCRYPTION_KEY', isDev ? DEV_ENCRYPTION_KEY : undefined);

  // Reject known dev defaults in production
  if (!isDev) {
    if (jwtSecret === DEV_JWT_SECRET) {
      throw new Error('FATAL: JWT_SECRET must not use the default development value in production. Set a unique secret.');
    }
    if (encryptionKey === DEV_ENCRYPTION_KEY) {
      throw new Error('FATAL: ENCRYPTION_KEY must not use the default development value in production. Set a unique key.');
    }
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv,
    database: {
      url: requireEnv('DATABASE_URL', isDev ? 'postgresql://justiceops:devpassword@localhost:5432/justiceops' : undefined),
    },
    jwt: {
      secret: jwtSecret,
      expiresIn: '24h',
    },
    encryption: {
      key: encryptionKey,
    },
    rateLimit: {
      bookingPerUser: 20,
      bookingPerOrg: 200,
    },
    credit: {
      threshold: 20,
    },
    cors: {
      origins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
        : isDev
          ? ['http://localhost:4200', 'http://localhost:3000', 'http://127.0.0.1:4200', 'http://127.0.0.1:3000']
          : [],
    },
  };
}
