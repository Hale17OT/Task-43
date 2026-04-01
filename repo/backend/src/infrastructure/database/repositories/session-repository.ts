import { Knex } from 'knex';
import { Session, SessionRepository } from '../../../domain/ports/session-repository.js';

function toDomain(row: any): Session {
  return {
    id: row.id,
    userId: row.user_id,
    sessionNonce: row.session_nonce,
    tokenJti: row.token_jti,
    ipAddress: row.ip_address,
    workstationId: row.workstation_id,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
  };
}

export class KnexSessionRepository implements SessionRepository {
  constructor(private db: Knex) {}

  async findByUserIdAndNonce(userId: string, nonce: string): Promise<Session | null> {
    const row = await this.db('user_sessions')
      .where({ user_id: userId, session_nonce: nonce })
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
      session_nonce: input.sessionNonce,
      token_jti: input.tokenJti,
      ip_address: input.ipAddress,
      workstation_id: input.workstationId,
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
