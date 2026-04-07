import { Knex } from 'knex';
import { Review } from '../../../domain/entities/review.js';
import { encrypt, decrypt } from '../../encryption/index.js';

export interface CreateReviewInput {
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  timeliness: number;
  professionalism: number;
  communication: number;
  comment?: string;
}

export interface Dispute {
  id: string;
  reviewId: string;
  appellantId: string;
  reason: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  resolutionNotes: string | null;
  adminId: string | null;
  penaltyEscrowed: any;
  filedAt: Date;
  deadlineAt: Date;
  resolvedAt: Date | null;
}

function toReview(row: any): Review {
  let comment = row.comment;
  if (comment) {
    try { comment = decrypt(comment); } catch { /* legacy unencrypted data */ }
  }
  return {
    id: row.id,
    bookingId: row.booking_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    timeliness: row.timeliness,
    professionalism: row.professionalism,
    communication: row.communication,
    comment,
    createdAt: new Date(row.created_at),
  };
}

function toDispute(row: any): Dispute {
  let reason = row.reason;
  try { reason = decrypt(reason); } catch { /* legacy unencrypted data */ }
  let resolutionNotes = row.resolution_notes;
  if (resolutionNotes) {
    try { resolutionNotes = decrypt(resolutionNotes); } catch { /* legacy unencrypted data */ }
  }
  return {
    id: row.id,
    reviewId: row.review_id,
    appellantId: row.appellant_id,
    reason,
    status: row.status,
    resolutionNotes,
    adminId: row.admin_id,
    penaltyEscrowed: row.penalty_escrowed,
    filedAt: new Date(row.filed_at),
    deadlineAt: new Date(row.deadline_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

export class KnexReviewRepository {
  constructor(private db: Knex) {}

  async findReviewById(id: string): Promise<Review | null> {
    const row = await this.db('reviews').where({ id }).first();
    return row ? toReview(row) : null;
  }

  async findReviewsByBookingId(bookingId: string): Promise<Review[]> {
    const rows = await this.db('reviews').where({ booking_id: bookingId });
    return rows.map(toReview);
  }

  async findReviewsByRole(userId: string, role: 'reviewer' | 'reviewee', opts?: { page?: number; limit?: number }): Promise<{ data: Review[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;
    const column = role === 'reviewer' ? 'reviewer_id' : 'reviewee_id';
    const query = this.db('reviews').where({ [column]: userId });
    const countResult = await query.clone().count('id as count').first();
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
    return { data: rows.map(toReview), total: Number(countResult?.count ?? 0) };
  }

  async findReviewsByUserId(userId: string, opts?: { page?: number; limit?: number }): Promise<{ data: Review[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;
    const query = this.db('reviews').where({ reviewer_id: userId }).orWhere({ reviewee_id: userId });
    const countResult = await query.clone().count('id as count').first();
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
    return { data: rows.map(toReview), total: Number(countResult?.count ?? 0) };
  }

  async hasUserReviewedBooking(bookingId: string, reviewerId: string): Promise<boolean> {
    const row = await this.db('reviews').where({ booking_id: bookingId, reviewer_id: reviewerId }).first();
    return !!row;
  }

  async createReview(input: CreateReviewInput): Promise<Review> {
    const [row] = await this.db('reviews').insert({
      booking_id: input.bookingId,
      reviewer_id: input.reviewerId,
      reviewee_id: input.revieweeId,
      timeliness: input.timeliness,
      professionalism: input.professionalism,
      communication: input.communication,
      comment: input.comment ? encrypt(input.comment) : null,
    }).returning('*');
    return toReview(row);
  }

  // Disputes
  async findDisputeById(id: string): Promise<Dispute | null> {
    const row = await this.db('disputes').where({ id }).first();
    return row ? toDispute(row) : null;
  }

  async findDisputes(filters?: { status?: string; orgId?: string; page?: number; limit?: number }): Promise<{ data: Dispute[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    let query = this.db('disputes');
    if (filters?.status) {
      const statuses = filters.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        query = query.where({ status: statuses[0] });
      } else {
        query = query.whereIn('status', statuses);
      }
    }
    if (filters?.orgId) query = query.where({ org_id: filters.orgId });
    const countResult = await query.clone().count('id as count').first();
    const rows = await query.orderBy('filed_at', 'desc').limit(limit).offset((page - 1) * limit);
    return { data: rows.map(toDispute), total: Number(countResult?.count ?? 0) };
  }

  async createDispute(input: { reviewId: string; appellantId: string; orgId: string; reason: string; deadlineAt: Date; penaltyEscrowed?: any }): Promise<Dispute> {
    const [row] = await this.db('disputes').insert({
      review_id: input.reviewId,
      appellant_id: input.appellantId,
      org_id: input.orgId,
      reason: encrypt(input.reason),
      deadline_at: input.deadlineAt,
      penalty_escrowed: input.penaltyEscrowed ? JSON.stringify(input.penaltyEscrowed) : null,
    }).returning('*');
    return toDispute(row);
  }

  async updateDispute(id: string, fields: Partial<Pick<Dispute, 'status' | 'resolutionNotes' | 'adminId' | 'resolvedAt'>>): Promise<Dispute | null> {
    const dbFields: Record<string, any> = {};
    if (fields.status) dbFields.status = fields.status;
    if (fields.resolutionNotes) dbFields.resolution_notes = encrypt(fields.resolutionNotes);
    if (fields.adminId) dbFields.admin_id = fields.adminId;
    if (fields.resolvedAt) dbFields.resolved_at = fields.resolvedAt;

    const [row] = await this.db('disputes').where({ id }).update(dbFields).returning('*');
    return row ? toDispute(row) : null;
  }
}
