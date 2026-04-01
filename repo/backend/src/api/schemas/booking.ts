import { z } from 'zod';

export const createBookingSchema = z.object({
  lawyerId: z.string().uuid(),
  type: z.enum(['consultation', 'milestone']),
  scheduledAt: z.string().datetime().optional(),
  deadlineAt: z.string().datetime().optional(),
  weight: z.number().int().min(1).optional(),
  idempotencyKey: z.string().uuid(),
}).refine((data) => {
  if (data.type === 'consultation' && !data.scheduledAt) {
    return false;
  }
  if (data.type === 'milestone' && !data.deadlineAt) {
    return false;
  }
  return true;
}, { message: 'Consultations require scheduledAt; milestones require deadlineAt' });

export const rescheduleBookingSchema = z.object({
  newScheduledAt: z.string().datetime(),
  idempotencyKey: z.string().uuid(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
