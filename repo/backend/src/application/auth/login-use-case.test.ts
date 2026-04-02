import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { LoginUseCase, AuthError } from './login-use-case.js';
import { UserRepository } from '../../domain/ports/user-repository.js';
import { SessionRepository } from '../../domain/ports/session-repository.js';
import { User } from '../../domain/entities/user.js';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
  },
}));

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    orgId: 'org-1',
    username: 'testuser',
    passwordHash: '$2b$12$hashed',
    role: 'client',
    creditScore: 50,
    isActive: true,
    isSessionExempt: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    dailyCapacity: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LoginUseCase', () => {
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let useCase: LoginUseCase;

  beforeEach(() => {
    userRepo = {
      findById: vi.fn(),
      findByUsername: vi.fn(),
      findByOrgId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      incrementFailedAttempts: vi.fn().mockResolvedValue(1),
      resetFailedAttempts: vi.fn(),
      updateCreditScore: vi.fn(),
    };

    sessionRepo = {
      findByUserIdAndNonce: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      deleteByUserId: vi.fn(),
      deleteById: vi.fn(),
      deleteExpired: vi.fn(),
    };

    useCase = new LoginUseCase(userRepo, sessionRepo);
  });

  it('returns token data on successful login', async () => {
    const user = createMockUser();
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await useCase.execute({ username: 'testuser', password: 'SecurePass1!' });

    expect(result.user.id).toBe('user-1');
    expect(result.user.role).toBe('client');
    expect(result.sessionNonce).toBeDefined();
    expect(result.jti).toBeDefined();
    expect(result.menuPermissions).toContain('client.dashboard');
    expect(result.serverTime).toBeDefined();
    expect(userRepo.resetFailedAttempts).toHaveBeenCalledWith('user-1');
    expect(sessionRepo.deleteByUserId).toHaveBeenCalledWith('user-1');
    expect(sessionRepo.create).toHaveBeenCalled();
  });

  it('throws 401 for unknown username', async () => {
    (userRepo.findByUsername as any).mockResolvedValue(null);

    await expect(useCase.execute({ username: 'nobody', password: 'pass' }))
      .rejects.toThrow(AuthError);

    try {
      await useCase.execute({ username: 'nobody', password: 'pass' });
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
    }
  });

  it('throws 401 for wrong password and increments attempts', async () => {
    const user = createMockUser();
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(useCase.execute({ username: 'testuser', password: 'wrong' }))
      .rejects.toThrow(AuthError);

    expect(userRepo.incrementFailedAttempts).toHaveBeenCalledWith('user-1');
  });

  it('throws 401 with retryAfterSeconds when account is locked', async () => {
    const user = createMockUser({
      lockedUntil: new Date(Date.now() + 600000), // 10 min from now
    });
    (userRepo.findByUsername as any).mockResolvedValue(user);

    try {
      await useCase.execute({ username: 'testuser', password: 'any' });
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
      expect(e.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('locks account on 5th failed attempt with 15-minute duration', async () => {
    const before = Date.now();
    const user = createMockUser({ failedLoginAttempts: 4 });
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(false);
    (userRepo.incrementFailedAttempts as any).mockResolvedValue(5);

    try {
      await useCase.execute({ username: 'testuser', password: 'wrong' });
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
      expect(e.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
      expect(userRepo.update).toHaveBeenCalled();
      // Verify the lockout expiry passed to update is ~15 minutes from now
      const updateCall = (userRepo.update as any).mock.calls[0];
      const lockedUntil = updateCall[1].lockedUntil as Date;
      expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
      expect(lockedUntil.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
    }
  });

  it('does NOT lock on 4th failed attempt', async () => {
    const user = createMockUser({ failedLoginAttempts: 3 });
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(false);
    (userRepo.incrementFailedAttempts as any).mockResolvedValue(4);

    try {
      await useCase.execute({ username: 'testuser', password: 'wrong' });
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.statusCode).toBe(401); // Not 423
      expect(userRepo.update).not.toHaveBeenCalled(); // No lockout set
    }
  });

  it('throws 401 for inactive account', async () => {
    const user = createMockUser({ isActive: false });
    (userRepo.findByUsername as any).mockResolvedValue(user);

    await expect(useCase.execute({ username: 'testuser', password: 'any' }))
      .rejects.toThrow(AuthError);
  });

  it('does NOT revoke sessions for session-exempt user', async () => {
    const user = createMockUser({ isSessionExempt: true });
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    await useCase.execute({ username: 'testuser', password: 'SecurePass1!' });

    expect(sessionRepo.deleteByUserId).not.toHaveBeenCalled();
  });

  it('returns correct permissions for lawyer role', async () => {
    const user = createMockUser({ role: 'lawyer' });
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await useCase.execute({ username: 'testuser', password: 'SecurePass1!' });
    expect(result.menuPermissions).toContain('lawyer.dashboard');
    expect(result.menuPermissions).toContain('lawyer.availability');
  });

  it('returns correct permissions for admin role', async () => {
    const user = createMockUser({ role: 'admin' });
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await useCase.execute({ username: 'testuser', password: 'SecurePass1!' });
    expect(result.menuPermissions).toContain('admin.dashboard');
    expect(result.menuPermissions).toContain('reports');
    expect(result.menuPermissions).not.toContain('admin.organizations');
  });

  it('returns correct permissions for super_admin role', async () => {
    const user = createMockUser({ role: 'super_admin' });
    (userRepo.findByUsername as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await useCase.execute({ username: 'testuser', password: 'SecurePass1!' });
    expect(result.menuPermissions).toContain('admin.organizations');
  });
});
