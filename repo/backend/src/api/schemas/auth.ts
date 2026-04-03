import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(255),
  password: z.string().min(1, 'Password is required').max(1000),
});

export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/, 'Password must contain at least one symbol'),
  role: z.enum(['client', 'lawyer', 'admin', 'super_admin']),
  orgId: z.string().uuid('Invalid organization ID'),
  dailyCapacity: z.number().int().positive().optional(),
  isSessionExempt: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  isActive: z.boolean().optional(),
  isSessionExempt: z.boolean().optional(),
  role: z.enum(['client', 'lawyer', 'admin', 'super_admin']).optional(),
  dailyCapacity: z.number().int().positive().nullable().optional(),
}).strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
