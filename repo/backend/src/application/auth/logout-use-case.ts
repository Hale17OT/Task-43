import { SessionRepository } from '../../domain/ports/session-repository.js';

export class LogoutUseCase {
  constructor(private sessionRepo: SessionRepository) {}

  async execute(userId: string): Promise<void> {
    await this.sessionRepo.deleteByUserId(userId);
  }
}
