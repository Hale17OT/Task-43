import { Booking, BookingStatus, BookingType } from '../entities/booking.js';

export interface CreateBookingInput {
  clientId: string;
  lawyerId: string;
  orgId: string;
  type: BookingType;
  scheduledAt?: Date;
  deadlineAt?: Date;
  weight?: number;
  idempotencyKey?: string;
}

export interface BookingFilters {
  clientId?: string;
  lawyerId?: string;
  orgId?: string;
  status?: BookingStatus;
  type?: BookingType;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export interface BookingRepository {
  findById(id: string): Promise<Booking | null>;
  findAll(filters: BookingFilters): Promise<{ data: Booking[]; total: number }>;
  create(input: CreateBookingInput): Promise<Booking>;
  updateStatus(id: string, status: BookingStatus, extra?: Partial<Booking>): Promise<Booking | null>;
  checkConflict(lawyerId: string, scheduledAt: Date): Promise<boolean>;
  getDailyMilestoneWeight(lawyerId: string, date: Date): Promise<number>;
  acquireAdvisoryLock(lawyerId: string, scheduledAt: Date): Promise<void>;
}
