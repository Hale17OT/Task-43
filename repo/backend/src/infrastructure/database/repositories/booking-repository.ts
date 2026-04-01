import { Knex } from 'knex';
import { Booking, BookingStatus, BookingType } from '../../../domain/entities/booking.js';
import { BookingRepository, CreateBookingInput, BookingFilters } from '../../../domain/ports/booking-repository.js';

function toDomain(row: any): Booking {
  return {
    id: row.id,
    clientId: row.client_id,
    lawyerId: row.lawyer_id,
    orgId: row.org_id,
    type: row.type,
    status: row.status,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
    deadlineAt: row.deadline_at ? new Date(row.deadline_at) : null,
    weight: row.weight,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    cancellationReasonEnc: row.cancellation_reason_enc,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KnexBookingRepository implements BookingRepository {
  constructor(private db: Knex) {}

  async findById(id: string): Promise<Booking | null> {
    const row = await this.db('bookings').where({ id }).first();
    return row ? toDomain(row) : null;
  }

  async findAll(filters: BookingFilters): Promise<{ data: Booking[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = this.db('bookings');
    if (filters.clientId) query = query.where({ client_id: filters.clientId });
    if (filters.lawyerId) query = query.where({ lawyer_id: filters.lawyerId });
    if (filters.orgId) query = query.where({ org_id: filters.orgId });
    if (filters.status) {
      const statuses = filters.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        query = query.where({ status: statuses[0] });
      } else {
        query = query.whereIn('status', statuses);
      }
    }
    if (filters.type) query = query.where({ type: filters.type });
    if (filters.from) query = query.where('scheduled_at', '>=', filters.from);
    if (filters.to) query = query.where('scheduled_at', '<=', filters.to);

    const countResult = await query.clone().count('id as count').first();
    const total = Number(countResult?.count ?? 0);

    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);
    return { data: rows.map(toDomain), total };
  }

  async create(input: CreateBookingInput): Promise<Booking> {
    const [row] = await this.db('bookings').insert({
      client_id: input.clientId,
      lawyer_id: input.lawyerId,
      org_id: input.orgId,
      type: input.type,
      scheduled_at: input.scheduledAt ?? null,
      deadline_at: input.deadlineAt ?? null,
      weight: input.weight ?? 1,
      idempotency_key: input.idempotencyKey ?? null,
    }).returning('*');
    return toDomain(row);
  }

  async updateStatus(id: string, status: BookingStatus, extra?: Partial<Booking>): Promise<Booking | null> {
    const fields: Record<string, any> = { status, updated_at: new Date() };
    if (extra?.completedAt) fields.completed_at = extra.completedAt;
    if (extra?.cancellationReasonEnc) fields.cancellation_reason_enc = extra.cancellationReasonEnc;

    const [row] = await this.db('bookings').where({ id }).update(fields).returning('*');
    return row ? toDomain(row) : null;
  }

  async checkConflict(lawyerId: string, scheduledAt: Date): Promise<boolean> {
    const conflict = await this.db('bookings')
      .where({ lawyer_id: lawyerId })
      .where('scheduled_at', '=', scheduledAt)
      .whereIn('status', ['pending', 'confirmed'])
      .first();
    return !!conflict;
  }

  async getDailyMilestoneWeight(lawyerId: string, date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await this.db('bookings')
      .where({ lawyer_id: lawyerId, type: 'milestone' })
      .whereIn('status', ['pending', 'confirmed'])
      .where('deadline_at', '>=', startOfDay)
      .where('deadline_at', '<=', endOfDay)
      .sum('weight as total')
      .first();

    return Number(result?.total ?? 0);
  }

  async acquireAdvisoryLock(lawyerId: string, scheduledAt: Date): Promise<void> {
    const lockKey = `${lawyerId}:${scheduledAt.toISOString()}`;
    await this.db.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [lockKey]);
  }
}
