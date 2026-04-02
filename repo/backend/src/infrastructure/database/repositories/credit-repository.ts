import { Knex } from 'knex';

export interface CreditScoreHistoryEntry {
  id: string;
  userId: string;
  previousScore: number;
  changeAmount: number;
  newScore: number;
  ruleCode: string;
  reason: string;
  isEscrowed: boolean;
  disputeId: string | null;
  createdAt: Date;
}

function toDomain(row: any): CreditScoreHistoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    previousScore: row.previous_score,
    changeAmount: row.change_amount,
    newScore: row.new_score,
    ruleCode: row.rule_code,
    reason: row.reason,
    isEscrowed: row.is_escrowed,
    disputeId: row.dispute_id,
    createdAt: new Date(row.created_at),
  };
}

export class KnexCreditRepository {
  constructor(private db: Knex) {}

  async getHistory(userId: string, opts?: { page?: number; limit?: number }): Promise<{ data: CreditScoreHistoryEntry[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    const countResult = await this.db('credit_score_history').where({ user_id: userId }).count('id as count').first();
    const rows = await this.db('credit_score_history')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    return { data: rows.map(toDomain), total: Number(countResult?.count ?? 0) };
  }

  async addEntry(input: Omit<CreditScoreHistoryEntry, 'id' | 'createdAt'>): Promise<CreditScoreHistoryEntry> {
    const [row] = await this.db('credit_score_history').insert({
      user_id: input.userId,
      previous_score: input.previousScore,
      change_amount: input.changeAmount,
      new_score: input.newScore,
      rule_code: input.ruleCode,
      reason: input.reason,
      is_escrowed: input.isEscrowed,
      dispute_id: input.disputeId,
    }).returning('*');
    return toDomain(row);
  }

  async escrowEntries(userId: string, disputeId: string): Promise<CreditScoreHistoryEntry[]> {
    const rows = await this.db('credit_score_history')
      .where({ user_id: userId, is_escrowed: false })
      .whereIn('rule_code', ['NO_SHOW', 'LATE_DELIVERY', 'CANCELLATION_PENALTY'])
      .update({ is_escrowed: true, dispute_id: disputeId })
      .returning('*');
    return rows.map(toDomain);
  }

  async resolveEscrow(disputeId: string, reapply: boolean): Promise<void> {
    if (reapply) {
      // Dispute dismissed — penalties stand. Mark entries as no longer escrowed.
      await this.db('credit_score_history')
        .where({ dispute_id: disputeId, is_escrowed: true })
        .update({ is_escrowed: false });
    } else {
      // Dispute upheld — penalties reversed. Delete the escrowed entries.
      await this.db('credit_score_history')
        .where({ dispute_id: disputeId, is_escrowed: true })
        .del();
    }
  }

  async getConsecutiveOnTimeCount(userId: string): Promise<number> {
    const rows = await this.db('bookings')
      .where({ client_id: userId, status: 'completed' })
      .orderBy('completed_at', 'desc')
      .limit(5)
      .select('status', 'completed_at', 'scheduled_at');

    let count = 0;
    for (const row of rows) {
      if (row.completed_at && row.scheduled_at) {
        const scheduledTime = new Date(row.scheduled_at).getTime();
        const completedTime = new Date(row.completed_at).getTime();
        if (completedTime <= scheduledTime + 10 * 60 * 1000) {
          count++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return count;
  }
}
