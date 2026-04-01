export interface CreditRuleConfig {
  ruleCode: string;
  changeAmount: number;
  description: string;
}

export const DEFAULT_CREDIT_RULES: Record<string, CreditRuleConfig> = {
  LATE_DELIVERY: {
    ruleCode: 'LATE_DELIVERY',
    changeAmount: -5,
    description: 'Late delivery penalty',
  },
  NO_SHOW: {
    ruleCode: 'NO_SHOW',
    changeAmount: -10,
    description: 'No-show penalty',
  },
  STREAK_BONUS: {
    ruleCode: 'STREAK_BONUS',
    changeAmount: 2,
    description: 'Five consecutive on-time completions bonus',
  },
  CANCELLATION_PENALTY: {
    ruleCode: 'CANCELLATION_PENALTY',
    changeAmount: -5,
    description: 'Late cancellation penalty (within 2 hours)',
  },
};

export const CREDIT_SCORE_MIN = 0;
export const CREDIT_SCORE_MAX = 100;
export const CREDIT_SCORE_DEFAULT = 50;
export const CREDIT_THRESHOLD = 20;
export const STREAK_LENGTH = 5;
