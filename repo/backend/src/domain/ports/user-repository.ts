import { User, CreateUserInput } from '../entities/user.js';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByOrgId(orgId: string, options?: { role?: string; page?: number; limit?: number }): Promise<{ data: User[]; total: number }>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, fields: Partial<Pick<User, 'username' | 'isActive' | 'isSessionExempt' | 'creditScore' | 'failedLoginAttempts' | 'lockedUntil' | 'role' | 'dailyCapacity'>>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  incrementFailedAttempts(id: string): Promise<number>;
  resetFailedAttempts(id: string): Promise<void>;
  updateCreditScore(id: string, newScore: number): Promise<void>;
}
