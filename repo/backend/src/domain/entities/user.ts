export type UserRole = 'client' | 'lawyer' | 'admin' | 'super_admin';

export interface User {
  id: string;
  orgId: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  creditScore: number;
  isActive: boolean;
  isSessionExempt: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  dailyCapacity: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  orgId: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  dailyCapacity?: number;
  isSessionExempt?: boolean;
}

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function isLockedOut(user: Pick<User, 'lockedUntil'>): boolean {
  if (!user.lockedUntil) return false;
  return new Date() < user.lockedUntil;
}

export function shouldLockOut(failedAttempts: number): boolean {
  return failedAttempts >= LOCKOUT_THRESHOLD;
}

export function getLockoutExpiry(): Date {
  return new Date(Date.now() + LOCKOUT_DURATION_MS);
}

export function getLockoutRemainingSeconds(lockedUntil: Date): number {
  return Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
}
