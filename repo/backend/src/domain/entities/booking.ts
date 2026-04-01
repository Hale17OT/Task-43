export type BookingType = 'consultation' | 'milestone';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'declined' | 'rescheduled';

export interface Booking {
  id: string;
  clientId: string;
  lawyerId: string;
  orgId: string;
  type: BookingType;
  status: BookingStatus;
  scheduledAt: Date | null;
  deadlineAt: Date | null;
  weight: number;
  completedAt: Date | null;
  cancellationReasonEnc: Buffer | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'declined', 'cancelled', 'rescheduled'],
  confirmed: ['completed', 'cancelled', 'no_show', 'rescheduled'],
  completed: [],
  cancelled: [],
  no_show: [],
  declined: [],
  rescheduled: [],
};

export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export const NO_SHOW_GRACE_MINUTES = 10;
export const CANCELLATION_PENALTY_HOURS = 2;

export function isWithinCancellationPenaltyWindow(scheduledAt: Date, serverNow: Date): boolean {
  const diff = scheduledAt.getTime() - serverNow.getTime();
  const twoHoursMs = CANCELLATION_PENALTY_HOURS * 60 * 60 * 1000;
  return diff < twoHoursMs;
}

export function isPastNoShowGrace(scheduledAt: Date, serverNow: Date): boolean {
  const graceMs = NO_SHOW_GRACE_MINUTES * 60 * 1000;
  return serverNow.getTime() > scheduledAt.getTime() + graceMs;
}
