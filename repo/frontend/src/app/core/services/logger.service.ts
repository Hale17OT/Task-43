import { Injectable } from '@angular/core';

export type LogCategory = 'auth' | 'booking' | 'notification' | 'sync' | 'report' | 'general';
export type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set(['token', 'password', 'secret', 'authorization', 'sessionNonce', 'nonce', 'passwordHash']);

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private redactString(value: string): string {
    return value
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[REDACTED]"')
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"')
      .replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"[REDACTED]"')
      .replace(/"authorization"\s*:\s*"[^"]*"/gi, '"authorization":"[REDACTED]"');
  }

  private redactData(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') return this.redactString(data);
    if (Array.isArray(data)) return data.map(item => this.redactData(item));
    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          result[key] = this.redactString(value);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.redactData(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return data;
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('info', category, message, data);
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('warn', category, message, data);
  }

  error(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('error', category, message, data);
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>) {
    const safeMessage = this.redactString(message);
    const safeData = data ? this.redactData(data) : undefined;
    switch (level) {
      case 'error': console.error(`[${category}]`, safeMessage, safeData ?? ''); break;
      case 'warn': console.warn(`[${category}]`, safeMessage, safeData ?? ''); break;
      default: console.log(`[${category}]`, safeMessage, safeData ?? '');
    }
  }
}
