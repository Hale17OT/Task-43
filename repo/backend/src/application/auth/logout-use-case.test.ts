import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogoutUseCase } from './logout-use-case.js';
import { SessionRepository } from '../../domain/ports/session-repository.js';

/**
 * Direct unit coverage for LogoutUseCase.
 *
 * The use case is a thin orchestration over `SessionRepository.deleteByUserId`,
 * but it is the single point through which all sessions for a user are
 * revoked. The contract — exactly one call, with the exact userId, and
 * bubbling of repository errors — must stay stable because it underpins
 * the security guarantee that a logout actually logs out *every* device.
 */

function createMockSessionRepo(): SessionRepository {
  return {
    findByUserIdAndNonce: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    deleteByUserId: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn(),
    deleteExpired: vi.fn(),
  };
}

describe('LogoutUseCase', () => {
  let sessionRepo: SessionRepository;
  let useCase: LogoutUseCase;

  beforeEach(() => {
    sessionRepo = createMockSessionRepo();
    useCase = new LogoutUseCase(sessionRepo);
  });

  it('resolves successfully and returns void on happy path', async () => {
    const result = await useCase.execute('user-123');
    expect(result).toBeUndefined();
  });

  it('calls SessionRepository.deleteByUserId with the provided userId', async () => {
    await useCase.execute('user-123');
    expect(sessionRepo.deleteByUserId).toHaveBeenCalledTimes(1);
    expect(sessionRepo.deleteByUserId).toHaveBeenCalledWith('user-123');
  });

  it('only calls deleteByUserId — does NOT touch deleteById or deleteExpired', async () => {
    await useCase.execute('user-123');
    expect(sessionRepo.deleteById).not.toHaveBeenCalled();
    expect(sessionRepo.deleteExpired).not.toHaveBeenCalled();
    expect(sessionRepo.findByUserId).not.toHaveBeenCalled();
    expect(sessionRepo.findByUserIdAndNonce).not.toHaveBeenCalled();
  });

  it('passes through repository errors so callers (and global error handler) see them', async () => {
    const boom = new Error('db connection lost');
    (sessionRepo.deleteByUserId as any).mockRejectedValueOnce(boom);

    await expect(useCase.execute('user-123')).rejects.toThrow('db connection lost');
  });

  it('revokes sessions for exactly the requested user (no wildcard leak)', async () => {
    await useCase.execute('alice');
    await useCase.execute('bob');

    const calls = (sessionRepo.deleteByUserId as any).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toBe('alice');
    expect(calls[1][0]).toBe('bob');
  });
});
