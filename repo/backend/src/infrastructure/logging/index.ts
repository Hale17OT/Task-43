import pino from 'pino';

const PII_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  { pattern: /"password"\s*:\s*"[^"]*"/gi, replacement: '"password":"[REDACTED]"' },
  { pattern: /"token"\s*:\s*"[^"]*"/gi, replacement: '"token":"[REDACTED]"' },
  { pattern: /"sessionNonce"\s*:\s*"[^"]*"/gi, replacement: '"sessionNonce":"[REDACTED]"' },
  { pattern: /"authorization"\s*:\s*"[^"]*"/gi, replacement: '"authorization":"[REDACTED]"' },
];

function maskPII(input: string): string {
  let masked = input;
  for (const { pattern, replacement } of PII_PATTERNS) {
    masked = masked.replace(pattern, replacement);
  }
  return masked;
}

export function createLogger(name: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  return pino({
    name,
    level: isTest ? 'silent' : (isProduction ? 'info' : 'debug'),
    serializers: {
      // Use pino's standard error serializer to preserve message + stack,
      // then mask PII in the serialized output.
      err(error: Error) {
        const serialized = pino.stdSerializers.err(error);
        if (serialized && typeof serialized.message === 'string') {
          serialized.message = maskPII(serialized.message);
        }
        if (serialized && typeof serialized.stack === 'string') {
          serialized.stack = maskPII(serialized.stack);
        }
        return serialized;
      },
    },
    formatters: {
      log(object: Record<string, unknown>) {
        const masked: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(object)) {
          if (key === 'err') {
            // Already handled by serializer above
            masked[key] = value;
          } else if (typeof value === 'string') {
            masked[key] = maskPII(value);
          } else if (typeof value === 'object' && value !== null) {
            try {
              masked[key] = JSON.parse(maskPII(JSON.stringify(value)));
            } catch {
              masked[key] = value;
            }
          } else {
            masked[key] = value;
          }
        }
        return masked;
      },
    },
    transport: isProduction
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
  });
}

export const logger = createLogger('justiceops');
