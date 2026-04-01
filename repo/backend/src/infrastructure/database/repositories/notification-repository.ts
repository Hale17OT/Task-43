import { Knex } from 'knex';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  type: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: Date;
}

function toDomain(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    type: row.type,
    referenceId: row.reference_id,
    isRead: row.is_read,
    createdAt: new Date(row.created_at),
  };
}

export class KnexNotificationRepository {
  constructor(private db: Knex) {}

  async findByUserId(userId: string, opts?: { unread?: boolean; page?: number; limit?: number }): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    let query = this.db('notifications').where({ user_id: userId });
    if (opts?.unread) query = query.where({ is_read: false });

    const countResult = await query.clone().count('id as count').first();
    const unreadResult = await this.db('notifications').where({ user_id: userId, is_read: false }).count('id as count').first();
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);

    return {
      data: rows.map(toDomain),
      total: Number(countResult?.count ?? 0),
      unreadCount: Number(unreadResult?.count ?? 0),
    };
  }

  async create(input: { userId: string; title: string; body?: string; type?: string; referenceId?: string }): Promise<Notification> {
    const [row] = await this.db('notifications').insert({
      user_id: input.userId,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? null,
      reference_id: input.referenceId ?? null,
    }).returning('*');
    return toDomain(row);
  }

  async markRead(id: string, userId: string): Promise<Notification | null> {
    const [row] = await this.db('notifications').where({ id, user_id: userId }).update({ is_read: true }).returning('*');
    return row ? toDomain(row) : null;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db('notifications').where({ user_id: userId, is_read: false }).update({ is_read: true });
  }
}
