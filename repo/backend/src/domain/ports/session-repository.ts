export interface Session {
  id: string;
  userId: string;
  sessionNonce: string;
  tokenJti: string;
  ipAddress: string | null;
  workstationId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionRepository {
  findByUserIdAndNonce(userId: string, nonce: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  create(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session>;
  deleteByUserId(userId: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}
