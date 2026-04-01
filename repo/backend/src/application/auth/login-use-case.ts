import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { UserRepository } from '../../domain/ports/user-repository.js';
import { SessionRepository } from '../../domain/ports/session-repository.js';
import { isLockedOut, shouldLockOut, getLockoutExpiry, getLockoutRemainingSeconds } from '../../domain/entities/user.js';

export interface LoginInput {
  username: string;
  password: string;
  ipAddress?: string;
  workstationId?: string;
}

export interface LoginResult {
  user: {
    id: string;
    orgId: string;
    username: string;
    role: string;
    creditScore: number;
  };
  sessionNonce: string;
  jti: string;
  menuPermissions: string[];
  serverTime: string;
}

export interface TokenSigner {
  sign(payload: Record<string, unknown>): string;
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  client: ['client.dashboard', 'client.bookings', 'client.credit', 'reviews', 'notifications'],
  lawyer: ['lawyer.dashboard', 'lawyer.availability', 'lawyer.bookings', 'reviews', 'notifications'],
  admin: ['admin.dashboard', 'admin.jobs', 'admin.arbitration', 'admin.users', 'admin.config', 'reports', 'reports.subscriptions', 'notifications'],
  super_admin: ['admin.dashboard', 'admin.jobs', 'admin.arbitration', 'admin.users', 'admin.organizations', 'admin.config', 'reports', 'reports.subscriptions', 'notifications'],
};

export class LoginUseCase {
  constructor(
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.userRepo.findByUsername(input.username);
    if (!user) {
      throw new AuthError(401, 'Invalid username or password');
    }

    if (!user.isActive) {
      throw new AuthError(401, 'Account is deactivated');
    }

    // Check lockout
    if (isLockedOut(user)) {
      const remaining = getLockoutRemainingSeconds(user.lockedUntil!);
      const err = new AuthError(423, `Account locked. Try again in ${remaining} seconds`);
      (err as any).retryAfterSeconds = remaining;
      throw err;
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatch) {
      const newCount = await this.userRepo.incrementFailedAttempts(user.id);
      if (shouldLockOut(newCount)) {
        const lockoutExpiry = getLockoutExpiry();
        await this.userRepo.update(user.id, {
          lockedUntil: lockoutExpiry,
        });
        const remaining = getLockoutRemainingSeconds(lockoutExpiry);
        const err = new AuthError(423, `Account locked after ${newCount} failed attempts. Try again in ${remaining} seconds`);
        (err as any).retryAfterSeconds = remaining;
        throw err;
      }
      throw new AuthError(401, 'Invalid username or password');
    }

    // Reset failed attempts
    await this.userRepo.resetFailedAttempts(user.id);

    // Revoke prior sessions (unless exempt)
    if (!user.isSessionExempt) {
      await this.sessionRepo.deleteByUserId(user.id);
    }

    // Create new session
    const sessionNonce = uuid();
    const jti = uuid();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.sessionRepo.create({
      userId: user.id,
      sessionNonce,
      tokenJti: jti,
      ipAddress: input.ipAddress ?? null,
      workstationId: input.workstationId ?? null,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        orgId: user.orgId,
        username: user.username,
        role: user.role,
        creditScore: user.creditScore,
      },
      sessionNonce,
      jti,
      menuPermissions: ROLE_PERMISSIONS[user.role] ?? [],
      serverTime: new Date().toISOString(),
    };
  }
}

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
