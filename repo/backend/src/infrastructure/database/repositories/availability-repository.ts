import { Knex } from 'knex';

export interface Availability {
  id: string;
  lawyerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateAvailabilityInput {
  lawyerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMin?: number;
}

function toDomain(row: any): Availability {
  return {
    id: row.id,
    lawyerId: row.lawyer_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    slotDurationMin: row.slot_duration_min,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  };
}

export class KnexAvailabilityRepository {
  constructor(private db: Knex) {}

  async findByLawyerId(lawyerId: string): Promise<Availability[]> {
    const rows = await this.db('availability')
      .where({ lawyer_id: lawyerId, is_active: true })
      .orderBy('day_of_week')
      .orderBy('start_time');
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Availability | null> {
    const row = await this.db('availability').where({ id }).first();
    return row ? toDomain(row) : null;
  }

  async create(input: CreateAvailabilityInput): Promise<Availability> {
    const [row] = await this.db('availability').insert({
      lawyer_id: input.lawyerId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      slot_duration_min: input.slotDurationMin ?? 60,
    }).returning('*');
    return toDomain(row);
  }

  async update(id: string, fields: Partial<Pick<Availability, 'startTime' | 'endTime' | 'isActive' | 'slotDurationMin'>>): Promise<Availability | null> {
    const dbFields: Record<string, any> = {};
    if (fields.startTime !== undefined) dbFields.start_time = fields.startTime;
    if (fields.endTime !== undefined) dbFields.end_time = fields.endTime;
    if (fields.isActive !== undefined) dbFields.is_active = fields.isActive;
    if (fields.slotDurationMin !== undefined) dbFields.slot_duration_min = fields.slotDurationMin;

    const [row] = await this.db('availability').where({ id }).update(dbFields).returning('*');
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.db('availability').where({ id }).del();
    return count > 0;
  }

  async checkOverlap(lawyerId: string, dayOfWeek: number, startTime: string, endTime: string, excludeId?: string): Promise<boolean> {
    let query = this.db('availability')
      .where({ lawyer_id: lawyerId, day_of_week: dayOfWeek, is_active: true })
      .where('start_time', '<', endTime)
      .where('end_time', '>', startTime);

    if (excludeId) {
      query = query.whereNot({ id: excludeId });
    }

    const conflict = await query.first();
    return !!conflict;
  }
}
