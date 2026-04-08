import { Knex } from 'knex';
import { createHash } from 'crypto';
import { User, CreateUserInput } from '../../../domain/entities/user.js';
import { UserRepository } from '../../../domain/ports/user-repository.js';
import { encrypt, decrypt } from '../../encryption/index.js';

function hashUsername(username: string): string {
  return createHash('sha256').update(username).digest('hex');
}

function decryptUsername(value: string): string {
  return decrypt(value);
}

function toDomain(row: any): User {
  return {
    id: row.id,
    orgId: row.org_id,
    username: decryptUsername(row.username),
    passwordHash: row.password_hash,
    role: row.role,
    creditScore: row.credit_score,
    isActive: row.is_active,
    isSessionExempt: row.is_session_exempt,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    dailyCapacity: row.daily_capacity,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KnexUserRepository implements UserRepository {
  constructor(private db: Knex) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db('users').where({ id }).first();
    return row ? toDomain(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const usernameHash = hashUsername(username);
    const row = await this.db('users')
      .where({ username_hash: usernameHash })
      .first();
    return row ? toDomain(row) : null;
  }

  async findByOrgId(orgId: string, options?: { role?: string; page?: number; limit?: number }): Promise<{ data: User[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = this.db('users').where({ org_id: orgId });
    if (options?.role) {
      query = query.where({ role: options.role });
    }

    const countResult = await query.clone().count('id as count').first();
    const total = Number(countResult?.count ?? 0);

    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);
    return { data: rows.map(toDomain), total };
  }

  async create(input: CreateUserInput): Promise<User> {
    const [row] = await this.db('users').insert({
      org_id: input.orgId,
      username: encrypt(input.username),
      username_hash: hashUsername(input.username),
      password_hash: input.passwordHash,
      role: input.role,
      daily_capacity: input.dailyCapacity ?? null,
      is_session_exempt: input.isSessionExempt ?? false,
    }).returning('*');
    return toDomain(row);
  }

  async update(id: string, fields: Partial<Pick<User, 'username' | 'isActive' | 'isSessionExempt' | 'creditScore' | 'failedLoginAttempts' | 'lockedUntil' | 'role' | 'dailyCapacity'>>): Promise<User | null> {
    const dbFields: Record<string, any> = {};
    if (fields.username !== undefined) {
      dbFields.username = encrypt(fields.username);
      dbFields.username_hash = hashUsername(fields.username);
    }
    if (fields.isActive !== undefined) dbFields.is_active = fields.isActive;
    if (fields.isSessionExempt !== undefined) dbFields.is_session_exempt = fields.isSessionExempt;
    if (fields.creditScore !== undefined) dbFields.credit_score = fields.creditScore;
    if (fields.failedLoginAttempts !== undefined) dbFields.failed_login_attempts = fields.failedLoginAttempts;
    if (fields.lockedUntil !== undefined) dbFields.locked_until = fields.lockedUntil;
    if (fields.role !== undefined) dbFields.role = fields.role;
    if (fields.dailyCapacity !== undefined) dbFields.daily_capacity = fields.dailyCapacity;

    dbFields.updated_at = new Date();

    const [row] = await this.db('users').where({ id }).update(dbFields).returning('*');
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.db('users').where({ id }).del();
    return count > 0;
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const [row] = await this.db('users')
      .where({ id })
      .increment('failed_login_attempts', 1)
      .returning('failed_login_attempts');
    return row.failed_login_attempts;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.db('users').where({ id }).update({
      failed_login_attempts: 0,
      locked_until: null,
    });
  }

  async updateCreditScore(id: string, newScore: number): Promise<void> {
    await this.db('users').where({ id }).update({
      credit_score: newScore,
      updated_at: new Date(),
    });
  }
}
