import { z } from 'zod';

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  timeliness: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const createDisputeSchema = z.object({
  reviewId: z.string().uuid(),
  reason: z.string().min(10).max(2000),
});

export const resolveDisputeSchema = z.object({
  resolution: z.enum(['upheld', 'dismissed']),
  notes: z.string().max(2000).optional(),
});
