import { CREDIT_SCORE_MIN, CREDIT_SCORE_MAX, CREDIT_THRESHOLD } from '../../config/credit-rules.js';

export class CreditScore {
  private constructor(public readonly value: number) {}

  static create(value: number): CreditScore {
    return new CreditScore(CreditScore.clamp(value));
  }

  static clamp(value: number): number {
    return Math.max(CREDIT_SCORE_MIN, Math.min(CREDIT_SCORE_MAX, value));
  }

  apply(change: number): CreditScore {
    return CreditScore.create(this.value + change);
  }

  isAboveThreshold(): boolean {
    return this.value >= CREDIT_THRESHOLD;
  }

  isBelowThreshold(): boolean {
    return this.value < CREDIT_THRESHOLD;
  }
}
