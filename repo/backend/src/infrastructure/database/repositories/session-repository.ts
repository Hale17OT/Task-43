import { Knex } from 'knex';
import { createHash } from 'crypto';
import { Session, SessionRepository } from '../../../domain/ports/session-repository.js';
import { encrypt, decrypt } from '../../encryption/index.js';

function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex');
}

function decryptField(value: string | null): string | null {
  if (!value) return null;
  return decrypt(value);
}

function toDomain(row: any): Session {
  return {
    id: row.id,
    userId: row.user_id,
    sessionNonce: decryptField(row.session_nonce) ?? row.session_nonce,
    tokenJti: decryptField(row.token_jti) ?? row.token_jti,
    ipAddress: decryptField(row.ip_address),
    workstationId: decryptField(row.workstation_id),
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
  };
}

export class KnexSessionRepository implements SessionRepository {
  constructor(private db: Knex) {}

  async findByUserIdAndNonce(userId: string, nonce: string): Promise<Session | null> {
    // Use deterministic hash for lookup (nonce is encrypted at rest)
    const nonceHash = hashNonce(nonce);
    const row = await this.db('user_sessions')
      .where({ user_id: userId, session_nonce_hash: nonceHash })
      .where('expires_at', '>', new Date())
      .first();
    return row ? toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const rows = await this.db('user_sessions')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');
    return rows.map(toDomain);
  }

  async create(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    const [row] = await this.db('user_sessions').insert({
      user_id: input.userId,
      session_nonce: encrypt(input.sessionNonce),
      session_nonce_hash: hashNonce(input.sessionNonce),
      token_jti: encrypt(input.tokenJti),
      ip_address: input.ipAddress ? encrypt(input.ipAddress) : null,
      workstation_id: input.workstationId ? encrypt(input.workstationId) : null,
      expires_at: input.expiresAt,
    }).returning('*');
    return toDomain(row);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db('user_sessions').where({ user_id: userId }).del();
  }

  async deleteById(id: string): Promise<void> {
    await this.db('user_sessions').where({ id }).del();
  }

  async deleteExpired(): Promise<number> {
    return await this.db('user_sessions').where('expires_at', '<', new Date()).del();
  }
}
